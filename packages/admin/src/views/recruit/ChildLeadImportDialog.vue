<template>
  <el-dialog
    :model-value="visible"
    title="批量导入潜客"
    width="1080px"
    :close-on-click-modal="false"
    @update:model-value="(v) => emit('update:visible', v)"
    @close="reset"
  >
    <!-- 顶部说明区 -->
    <el-alert type="info" :closable="false" show-icon class="mb">
      <template #title>导入流程</template>
      <div class="intro">
        1. 下载 Excel 模板 (8 列: 手机号 / 孩子姓名 / 年龄 / 试听科目 / 学校 / 年级 / 班级 / 邀约老师) —
        <el-link type="primary" :underline="false" @click="handleDownloadTemplate">[下载模板]</el-link>
        <br />
        2. 填好后上传, 每次最多 1000 行 —
        <el-upload
          :show-file-list="false"
          :auto-upload="true"
          :http-request="handleUpload"
          accept=".xlsx,.xls"
          :before-upload="beforeUpload"
        >
          <el-button link type="primary">[上传 Excel]</el-button>
        </el-upload>
        <br />
        3. 预览无误后点"确认导入"<br />
        <span class="muted">
          • <b>必填</b>: 手机号 / 孩子姓名 / 年龄 (2-25); <br />
          • <b>试听科目</b>: 填名称 (例 Python/Spike/Scratch), 找不到时按年龄兜底: &lt;6 → 大颗粒, 6-8 → Spike, 其他 → Scratch; <br />
          • <b>学校</b>: 填名称, 找不到时留空 (不报错); <br />
          • <b>邀约老师</b>: 填姓名或手机号, 找不到时回退为上传人; <br />
          • 同手机号已存在家长 → 直接加孩子; <br />
          • 同手机号+同孩子姓名 → 跳过 (不报错也不更新); <br />
          • 同手机号+不同孩子姓名 → 视为二孩, 正常加孩
        </span>
      </div>
    </el-alert>

    <!-- 解析中 -->
    <div v-if="step === 'parsing'" v-loading="true" class="state-block">解析中...</div>

    <!-- 预览表格 (错误行标红) -->
    <template v-if="step === 'preview'">
      <div class="summary mb">
        <el-tag>共 {{ previewRows.length }} 行</el-tag>
        <el-tag type="success" class="ml">合法 {{ validCount }} 行</el-tag>
        <el-tag v-if="errorCount > 0" type="danger" class="ml">错误 {{ errorCount }} 行</el-tag>
        <span v-if="errorCount > 0" class="ml muted">错误行不会提交</span>
      </div>
      <el-table :data="previewRows" border max-height="380" size="small">
        <el-table-column label="行号" prop="rowNo" width="60" fixed />
        <el-table-column label="手机号" prop="phone" width="130" fixed>
          <template #default="{ row }">
            <span :class="{ 'err-text': row.phone && !row.phoneValid }">
              {{ row.phone || '(空)' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="孩子姓名" prop="name" width="110" fixed>
          <template #default="{ row }">
            <span :class="{ 'err-text': row.name && !row.nameValid }">
              {{ row.name || '(空)' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="年龄" prop="age" width="70">
          <template #default="{ row }">
            <span :class="{ 'err-text': row._ageRaw && !row.ageValid }">
              {{ row._ageRaw || '(空)' }}
            </span>
          </template>
        </el-table-column>
        <el-table-column label="试听科目" prop="trialSubject" width="120">
          <template #default="{ row }">
            <span v-if="row.trialSubject">{{ row.trialSubject }}</span>
            <span v-else class="muted">— 后端按年龄兜底 —</span>
          </template>
        </el-table-column>
        <el-table-column label="学校" prop="school" width="130">
          <template #default="{ row }">
            <span v-if="row.school">{{ row.school }}</span>
            <span v-else-if="row._schoolRaw" class="muted">未找到→空</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="年级" prop="grade" width="80">
          <template #default="{ row }">
            <span v-if="row.grade">{{ row.grade }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="班级" prop="className" width="80">
          <template #default="{ row }">
            <span v-if="row.className">{{ row.className }}</span>
            <span v-else class="muted">—</span>
          </template>
        </el-table-column>
        <el-table-column label="邀约老师" prop="inviteTeacher" width="120">
          <template #default="{ row }">
            <span v-if="row.inviteTeacher">{{ row.inviteTeacher }}</span>
            <span v-else class="muted">— 默认上传人 —</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="140" fixed="right">
          <template #default="{ row }">
            <el-tag v-if="row._allValid" type="success" size="small">待导入</el-tag>
            <el-tag v-else type="danger" size="small">{{ row._error || '格式错' }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- 确认中 -->
    <div v-if="step === 'confirming'" v-loading="true" class="state-block">
      正在导入, 共 {{ validCount }} 行, 请稍候...
    </div>

    <!-- 结果展示 -->
    <template v-if="step === 'done' && result">
      <el-result
        :icon="resultIcon"
        :title="resultTitle"
        :sub-title="resultSubTitle"
      />
      <el-table :data="result.rows" border max-height="380" size="small">
        <el-table-column label="行号" prop="rowNo" width="60" fixed />
        <el-table-column label="手机号" prop="phone" width="120" fixed />
        <el-table-column label="孩子姓名" prop="name" width="100" fixed />
        <el-table-column label="结果" width="100" fixed>
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="试听科目 (实际)" min-width="200">
          <template #default="{ row }">
            <div v-if="row.resolved">
              <span v-if="row.resolved.trialSubject">{{ row.resolved.trialSubject }}</span>
              <span v-else class="muted">—</span>
              <div class="muted src">{{ sourceShort(row.resolved.trialSubjectSource) }}</div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="学校 (实际)" width="160">
          <template #default="{ row }">
            <div v-if="row.resolved">
              <span v-if="row.resolved.school">{{ row.resolved.school }}</span>
              <span v-else-if="row.resolved.schoolSource === 'not-found-empty'" class="warn-text">未找到 (留空)</span>
              <span v-else class="muted">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="邀约老师" min-width="200">
          <template #default="{ row }">
            <div v-if="row.resolved">
              <span v-if="row.resolved.inviteTeacher">{{ row.resolved.inviteTeacher }}</span>
              <span v-else class="muted">上传人 (空)</span>
              <div v-if="row.resolved.teacherSource && row.resolved.teacherSource.startsWith('fallback')" class="muted src">
                {{ row.resolved.teacherSource }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="错误" min-width="160">
          <template #default="{ row }">
            <span v-if="row.error" class="err-text">{{ row.error }}</span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template #footer>
      <el-button @click="onClose">{{ step === 'done' ? '关闭' : '取消' }}</el-button>
      <el-button
        v-if="step === 'preview'"
        type="primary"
        :loading="submitting"
        :disabled="validCount === 0"
        @click="onConfirm"
      >
        确认导入 {{ validCount }} 行
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup>
/**
 * 潜客批量导入 dialog (2026-06-20 升级)
 *
 * 状态机: idle → parsing → preview → confirming → done
 *
 * 8 列模板 (2026-06-20 升级):
 *   - 必填: 手机号 / 孩子姓名 / 年龄 (2-25)
 *   - 选填: 试听科目 / 学校 / 年级 / 班级 / 邀约老师
 *   - 后端 service 兜底:
 *       试听科目: <6 → 大颗粒, 6-8 → Spike, >8 → Scratch
 *       学校: 找不到留空
 *       邀约老师: 找不到回退上传人
 *
 * 设计取舍:
 *   - 前端解析 xlsx (admin 装 xlsx@^0.18.5)
 *   - 部分成功: 错误行不提交, 弹 el-table 标红; validCount 行才走 POST
 *   - 同 phone+name 跳过, 不报错也不更新
 *   - 1000 行上限 + 5MB 文件上限双重保护
 *   - 不走 storage/upload — 完全前端解析
 *   - result 行展示后端**实际写入的字段 + 兜底来源** (e.g. trialSubject=大颗粒, source=age-default)
 */
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { parentApi } from '@/api/parent'
import { downloadTemplate, PHONE_PATTERN, TEMPLATE_HEADERS } from '@/utils/leadImport'

const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['update:visible', 'imported'])

// === 状态 ===
const step = ref('idle')  // idle | parsing | preview | confirming | done
const previewRows = ref([])
const result = ref(null)
const submitting = ref(false)

// === 派生 ===
const validCount = computed(() =>
  previewRows.value.filter((r) => r._allValid).length
)
const errorCount = computed(() => previewRows.value.length - validCount.value)

const resultIcon = computed(() => {
  if (!result.value) return 'info'
  const r = result.value
  if (r.failCount === 0) return 'success'
  if (r.successCount === 0) return 'error'
  return 'warning'
})
const resultTitle = computed(() => {
  if (!result.value) return ''
  const r = result.value
  if (r.failCount === 0) return '导入成功'
  if (r.successCount === 0) return '导入失败'
  return '部分成功'
})
const resultSubTitle = computed(() => {
  if (!result.value) return ''
  const r = result.value
  return `成功 ${r.successCount} (新建家长 ${r.created} / 加孩 ${r.addedToExisting}) · 跳过 ${r.skipCount} · 失败 ${r.failCount}`
})

function statusLabel(s) {
  return { created: '新建家长', added: '加孩', skipped: '已存在', failed: '失败' }[s] || s
}
function statusTagType(s) {
  return { created: 'success', added: 'success', skipped: 'info', failed: 'danger' }[s] || ''
}

// 把后端的 source 长串压成短标签 (UI 友好)
function sourceShort(s) {
  if (!s) return ''
  if (s === 'matched') return '匹配字典'
  if (s === 'empty') return '空'
  if (s === 'empty-uploader') return '默认上传人'
  if (s === 'not-found-empty') return '未找到→空'
  if (s.startsWith('age-default:')) return `年龄兜底: ${s.slice('age-default:'.length)}`
  if (s.startsWith('fallback')) return '未找到→上传人'
  return s
}

// === 重置 ===
function reset() {
  step.value = 'idle'
  previewRows.value = []
  result.value = null
  submitting.value = false
}

function onClose() {
  emit('update:visible', false)
}

// === 下载模板 ===
function handleDownloadTemplate() {
  downloadTemplate()
}

// === 上传 + 解析 ===
function beforeUpload(file) {
  if (file.size > 5 * 1024 * 1024) {
    ElMessage.error('文件超过 5MB, 请拆批导入')
    return false
  }
  return true
}

async function handleUpload(req) {
  step.value = 'parsing'
  try {
    const buf = await req.file.arrayBuffer()
    // 动态 import xlsx (避免首屏 bundle 增大)
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    if (!ws) throw new Error('xlsx 文件无有效 sheet')

    // aoa → 二维数组
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', blankrows: false })
    if (!aoa.length) throw new Error('xlsx 文件为空')

    // 模板校验: 第 1 行必须是 8 列表头 (容忍空格)
    const header = (aoa[0] || []).map((c) => String(c || '').trim())
    const expected = TEMPLATE_HEADERS  // 8 列
    if (header.length < expected.length) {
      throw new Error(`模板列数不足: 期望 ${expected.length} 列, 实际 ${header.length} 列; 请用"下载模板"重新获取`)
    }
    for (let i = 0; i < expected.length; i++) {
      if (header[i] !== expected[i]) {
        throw new Error(`模板第 ${i + 1} 列表头应为 "${expected[i]}", 实际是 "${header[i] || '(空)'}"; 请用"下载模板"重新获取`)
      }
    }

    const rows = []
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i] || []
      const phone = String(r[0] || '').trim()
      const name = String(r[1] || '').trim()
      // 全空行跳过
      if (!phone && !name && !r[2] && !r[3] && !r[4] && !r[5] && !r[6] && !r[7]) continue
      // 年龄: xlsx 数字直接是 number, 也兼容字符串; 非整数 / <2 / >25 标错
      const ageRaw = r[2]
      const ageNum = ageRaw === '' || ageRaw == null ? null : Number(ageRaw)
      const ageValid = ageNum != null && Number.isInteger(ageNum) && ageNum >= 2 && ageNum <= 25
      // 选填字段原样 trim
      const trialSubject = String(r[3] || '').trim()
      const schoolRaw = String(r[4] || '').trim()
      const grade = String(r[5] || '').trim()
      const className = String(r[6] || '').trim()
      const inviteTeacher = String(r[7] || '').trim()

      const phoneValid = PHONE_PATTERN.test(phone)
      const nameValid = name.length >= 1 && name.length <= 50
      const error = !phone
        ? '手机号必填'
        : !phoneValid
          ? '手机号格式错'
          : !name
            ? '孩子姓名必填'
            : !nameValid
              ? '姓名 1-50 字'
              : ageRaw === '' || ageRaw == null
                ? '年龄必填'
                : !ageValid
                  ? '年龄需 2-25 整数'
                  : ''

      rows.push({
        rowNo: i + 1,  // 含表头 → 第 2 行数据 rowNo=2
        phone, name,
        age: ageNum,
        _ageRaw: ageRaw === '' || ageRaw == null ? '' : String(ageRaw),
        trialSubject, school: schoolRaw, _schoolRaw: schoolRaw,
        grade, className, inviteTeacher,
        phoneValid, nameValid, ageValid,
        _allValid: !error,
        _error: error
      })
    }
    if (rows.length === 0) throw new Error('xlsx 中没有有效数据行')
    if (rows.length > 1000) throw new Error(`单次最多 1000 行, 当前 ${rows.length} 行`)

    previewRows.value = rows
    step.value = 'preview'
  } catch (e) {
    ElMessage.error(e.message || '解析失败')
    step.value = 'idle'
  }
}

// === 确认导入 ===
async function onConfirm() {
  submitting.value = true
  step.value = 'confirming'
  try {
    const payload = previewRows.value
      .filter((r) => r._allValid)
      .map((r) => ({
        phone: r.phone,
        name: r.name,
        age: r.age,
        trialSubject: r.trialSubject,
        school: r.school,
        grade: r.grade,
        className: r.className,
        inviteTeacher: r.inviteTeacher
      }))
    const r = await parentApi.bulkImport(payload)
    // http 拦截器已解包, r = { success, data, message }
    // 部分成功模式: r.success = true, r.data 包含 results
    result.value = r.data
    step.value = 'done'
    emit('imported', r.data)
  } catch (e) {
    // 拦截器已 toast; 回退到 preview 让用户重试
    step.value = 'preview'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.mb { margin-bottom: 12px; }
.ml { margin-left: 8px; }
.muted { color: #909399; font-size: 12px; }
.warn-text { color: #e6a23c; font-size: 12px; }
.src { font-size: 11px; line-height: 1.4; }
.state-block {
  height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #909399;
}
.err-text { color: #f56c6c; }
.intro { font-size: 13px; line-height: 2; }
.summary { display: flex; align-items: center; flex-wrap: wrap; }
</style>
