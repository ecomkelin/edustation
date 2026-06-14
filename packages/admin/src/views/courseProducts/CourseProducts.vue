<template>
  <div class="page course-products-page">
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">课程产品</h2>
          <div class="subtitle">课程产品是开班与课包的共同基础。包含教学大纲（总课时）与售卖规则（价格 / 有效期）。</div>
        </div>
        <div class="header-actions">
          <el-tooltip
            :disabled="!!auth.currentOrgId"
            content="请先在顶部「机构切换」中选择一个目标机构"
            placement="top"
          >
            <el-button :disabled="!auth.currentOrgId" @click="openCreate">新建课程产品</el-button>
          </el-tooltip>
          <el-tooltip
            v-if="auth.isPlatformAdmin"
            :disabled="!!auth.currentOrgId"
            content="请先在顶部「机构切换」中选择一个目标机构"
            placement="top"
          >
            <el-button
              type="primary"
              :disabled="!auth.currentOrgId"
              @click="openSync"
            >从其他机构同步课程产品</el-button>
          </el-tooltip>
        </div>
      </div>
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="什么是课程产品？"
        description="课程产品 = 教学大纲 + 售卖规格。一个产品被开班（CourseInstance）引用为蓝本，也被学生持有的产品实例（StudentProduct）购买。同名校重 product 不会被复制到本公司，可后续在「编辑」中调整。"
        style="margin-top: 12px"
      />
    </el-card>

    <el-table :data="list" v-loading="loading" border style="margin-top: 12px">
      <el-table-column prop="name" label="名称" min-width="220" />
      <el-table-column label="学科" width="160">
        <template #default="{ row }">
          <template v-if="row.subjects && row.subjects.length">
            <el-tag v-for="s in row.subjects" :key="s._id || s.id" size="small" style="margin-right: 4px">
              {{ s.name }}
            </el-tag>
          </template>
          <span v-else style="color: #909399">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="totalLessons" label="总课时" width="100" />
      <el-table-column prop="minutesPerLesson" label="每课时(分钟)" width="120" />
      <el-table-column label="价格(元)" min-width="240">
        <template #default="{ row }">
          <div class="price-cell">
            <div v-if="row.promotionActive" class="price-line">
              <span class="muted strikethrough">¥{{ row.originalPrice }}</span>
              <span>→</span>
              <span class="discount">¥{{ row.discountPrice }}</span>
            </div>
            <div v-else class="price-line">
              <span class="muted strikethrough">¥{{ row.originalPrice }}</span>
              <span>→</span>
              <span class="discount">¥{{ row.discountPrice }}</span>
            </div>
            <div v-if="row.promotionActive" class="price-line promo">
              <el-tag type="danger" size="small">活动价</el-tag>
              <span class="promo-price">¥{{ row.promotionPrice }}</span>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="validDays" label="有效天数" width="100" />
      <el-table-column prop="isActive" label="在售" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive ? 'success' : 'info'">{{ row.isActive ? '是' : '否' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="240" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <!-- 仅超管可改上下架；物理删除走 DestructiveConfirm + 预检 -->
          <el-button
            v-if="isPlatformAdmin && row.isActive"
            size="small"
            type="warning"
            @click="deactivate(row)"
          >下架</el-button>
          <el-button
            v-else-if="isPlatformAdmin && !row.isActive"
            size="small"
            type="success"
            @click="reactivate(row)"
          >上架</el-button>
          <DestructiveConfirm
            v-if="isPlatformAdmin"
            :target="`课程产品 ${row.name}`"
            warning="高风险"
            :precheck-notes="['无订单明细引用', '无学生课包引用']"
            :precheck="() => courseProductApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger">误操删除</el-button>
          </DestructiveConfirm>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialog" :title="form._id ? '编辑课程产品' : '新建课程产品'" width="560px">
      <el-form :model="form" label-width="100px">
        <el-form-item label="名称"><el-input v-model="form.name" maxlength="100" /></el-form-item>
        <el-form-item label="学科">
          <el-select
            v-model="form.subjects"
            multiple
            collapse-tags
            collapse-tags-tooltip
            clearable
            placeholder="可多选；不选表示不挂学科（建议性）"
          >
            <el-option v-for="s in subjects" :key="s._id" :label="s.name" :value="s._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="总课时"><el-input-number v-model="form.totalLessons" :min="1" /></el-form-item>
        <el-form-item label="每课时(分钟)"><el-input-number v-model="form.minutesPerLesson" :min="1" /></el-form-item>

        <el-divider content-position="left">价格</el-divider>
        <el-form-item label="原价(元)">
          <el-input-number v-model="form.originalPrice" :min="0" :precision="2" />
          <div class="form-hint">心理锚点，不直接销售；用于划线价展示。</div>
        </el-form-item>
        <el-form-item label="折扣价(元)">
          <el-input-number v-model="form.discountPrice" :min="0" :precision="2" />
          <div class="form-hint">默认销售价。订单创建时按此价格快照 unitPrice。</div>
        </el-form-item>
        <el-form-item label="活动价(元)">
          <el-input-number v-model="form.promotionPrice" :min="0" :precision="2" :disabled="!form.promotionActive" />
          <div class="form-hint">
            活动期价格。仅在「启用活动」时生效，订单将按此价快照；0 表示免费赠课。
          </div>
        </el-form-item>
        <el-form-item label="启用活动">
          <el-switch v-model="form.promotionActive" />
          <span class="form-hint" style="margin-left: 8px">开启后，前端会展示活动价标签与价格。</span>
        </el-form-item>

        <el-form-item label="有效天数"><el-input-number v-model="form.validDays" :min="1" /></el-form-item>
        <el-form-item label="教学大纲"><el-input v-model="form.syllabus" type="textarea" :rows="3" maxlength="2000" /></el-form-item>
        <el-form-item label="课程附件">
          <div class="attachments">
            <div v-for="(id, i) in form.attachments" :key="id" class="attachment-chip">
              <el-icon style="margin-right: 4px"><Document /></el-icon>
              <span class="text-12" :title="id">{{ attachmentName(id) }}</span>
              <el-button link size="small" type="danger" @click="form.attachments.splice(i, 1)">移除</el-button>
            </div>
            <el-upload
              :show-file-list="false"
              :auto-upload="true"
              :http-request="uploadAttachment"
              :before-upload="beforeAttachmentUpload"
              accept="image/*,application/pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            >
              <el-button :icon="Upload" size="small">上传新附件</el-button>
            </el-upload>
            <el-button :icon="Folder" size="small" link @click="attachmentPicker = true">从文件库选</el-button>
          </div>
          <div class="form-hint">支持图片 / PDF / Office 文件</div>
        </el-form-item>
        <el-form-item label="在售">
          <el-switch v-model="form.isActive" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">确定</el-button>
      </template>
    </el-dialog>

    <!-- 从文件库选课程附件（多选） -->
    <FilePicker
      v-model="attachmentPicker"
      multiple
      scope="courseAttachment"
      title="选择课程附件"
      @select="onPickAttachments"
    />

    <!-- 跨机构同步弹窗 -->
    <el-dialog
      v-model="syncDialog"
      title="从其他机构同步课程产品"
      width="820px"
      :close-on-click-modal="false"
      destroy-on-close
    >
      <el-alert
        type="info"
        :closable="false"
        show-icon
        title="同步规则"
        description="仅复制与本公司不同名的产品；同名产品会被自动跳过，不会报错。学科是建议性字段，源端没挂学科的产品仍可同步；若源端学科在本公司不存在，对应产品会被标记为「本公司缺该学科」并跳过。新产品默认在售，可后续编辑。"
        style="margin-bottom: 8px"
      />
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        title="注意：本弹窗不会同步分类（学科）"
        description="如果源产品的学科在本公司不存在，对应产品会被跳过并标记为「本公司缺该学科」。如需补齐，请先在「学科」页完成跨机构同步后，再回来同步课程产品。"
        style="margin-bottom: 12px"
      />

      <div class="target-org-bar">
        <span class="label">目标机构：</span>
        <span class="value">{{ currentOrgName || '（未选择）' }}</span>
        <el-tag v-if="currentOrgName" type="info" size="small">同步到此</el-tag>
      </div>

      <el-form label-width="80px" style="margin-top: 8px">
        <el-form-item label="源机构">
          <el-select
            v-model="selectedSourceOrgId"
            filterable
            remote
            :remote-method="searchSourceOrgs"
            :loading="sourceOrgsLoading"
            placeholder="搜索源机构（名称 / 简称 / 信用代码）"
            style="width: 100%"
            @change="onSourceOrgChange"
          >
            <el-option
              v-for="o in sourceOrgs"
              :key="o._id"
              :value="o._id"
              :label="`${o.name}${o.nameAbbreviation ? '（' + o.nameAbbreviation + '）' : ''}`"
            />
          </el-select>
        </el-form-item>
      </el-form>

      <el-table
        v-if="selectedSourceOrgId"
        ref="syncTableRef"
        :data="sourceProducts"
        v-loading="sourceProductsLoading"
        border
        @selection-change="onSelectionChange"
        empty-text="该源机构下暂无课程产品"
        max-height="420"
      >
        <el-table-column
          type="selection"
          width="48"
          :selectable="(row) => !row.existsInCurrent"
        />
        <el-table-column prop="name" label="名称" min-width="180" />
        <el-table-column label="学科" width="160">
          <template #default="{ row }">
            <template v-if="row.subjects && row.subjects.length">
              <el-tag v-for="s in row.subjects" :key="s._id || s.id" size="small" style="margin-right: 4px">
                {{ s.name }}
              </el-tag>
            </template>
            <span v-else style="color: #999">—</span>
          </template>
        </el-table-column>
        <el-table-column label="总课时" width="80">
          <template #default="{ row }">
            <span style="color: #606266">{{ row.totalLessons }}</span>
          </template>
        </el-table-column>
        <el-table-column label="售价" width="160">
          <template #default="{ row }">
            <template v-if="row.discountPrice != null">
              <span class="muted strikethrough" style="margin-right: 4px">¥{{ row.originalPrice }}</span>
              <span style="color: #606266">¥{{ row.discountPrice }}</span>
              <el-tag v-if="row.promotionActive" type="danger" size="small" style="margin-left: 4px">¥{{ row.promotionPrice }}</el-tag>
            </template>
            <span v-else style="color: #909399">—</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="200">
          <template #default="{ row }">
            <el-tag v-if="row.existsInCurrent" type="warning" size="small">已存在，将跳过</el-tag>
            <el-tag v-else-if="row.skipReason === 'missing-subject-in-target'" type="info" size="small">本公司缺该学科</el-tag>
            <el-tag v-else type="success" size="small">可同步</el-tag>
          </template>
        </el-table-column>
      </el-table>

      <div v-if="selectedSourceOrgId" class="sync-summary">
        已选 <b>{{ selectedProductIds.length }}</b> 个可同步；
        <span style="color: #909399">
          源机构共 {{ sourceProducts.length }} 个，
          其中 {{ sourceProducts.filter((p) => p.skipReason).length }} 个将因「同名 / 缺学科」被跳过
        </span>
      </div>

      <template #footer>
        <el-button @click="syncDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="syncing"
          :disabled="!selectedProductIds.length"
          @click="confirmSync"
        >
          同步 {{ selectedProductIds.length }} 个课程产品
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, Folder, Upload } from '@element-plus/icons-vue'
import { courseProductApi } from '@/api/courseProduct'
import { storageApi } from '@/api/storage'
import { handleRemoveError } from '@/utils/removable'
import { subjectApi } from '@/api/subject'
import { useAuthStore } from '@/stores/auth'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import FilePicker from '@/components/FilePicker.vue'

const auth = useAuthStore()
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const list = ref([])
const subjects = ref([])
const loading = ref(false)
const dialog = ref(false)
const saving = ref(false)
const form = reactive({
  _id: null,
  name: '',
  subjects: [],
  totalLessons: 16,
  minutesPerLesson: 90,
  originalPrice: 2000,
  discountPrice: 1600,
  promotionPrice: 1200,
  promotionActive: false,
  validDays: 360,
  syllabus: '',
  isActive: true,
  attachments: []   // [ObjectId<Ref:File>]，后端 diffArrayById 自动绑/解
})

// 当前目标机构名称（顶部「机构切换」里选中的）
const currentOrgName = computed(() => {
  const id = auth.currentOrgId
  if (!id) return ''
  const org = (auth.orgs || []).find((o) => (o.id || o._id) === id)
  return org ? org.name : ''
})

async function load() {
  loading.value = true
  try {
    const r = await courseProductApi.list()
    list.value = r.data
  } finally {
    loading.value = false
  }
}

async function loadSubjects() {
  const r = await subjectApi.list()
  subjects.value = r.data
}

function openCreate() {
  Object.assign(form, {
    _id: null,
    name: '',
    subjects: [],
    totalLessons: 16,
    minutesPerLesson: 90,
    originalPrice: 2000,
    discountPrice: 1600,
    promotionPrice: 1200,
    promotionActive: false,
    validDays: 360,
    syllabus: '',
    isActive: true
  })
  dialog.value = true
}

function openEdit(row) {
  // 兜底：旧数据可能没 promotionPrice / promotionActive，避免把 undefined 发到后端
  // subjects 在列表里被 .populate() 成了对象数组，<el-select v-model> 与后端校验
  // 都期望 ID 字符串数组；这里统一规整为 id 数组
  const subjIds = Array.isArray(row.subjects)
    ? row.subjects.map((s) => (typeof s === 'string' ? s : (s && (s._id || s.id)) || null)).filter(Boolean)
    : []
  Object.assign(form, {
    promotionPrice: 0,
    promotionActive: false,
    ...row,
    subjects: subjIds
  })
  dialog.value = true
}

async function submit() {
  if (!form.name) return ElMessage.warning('请填写产品名称')
  if (!Array.isArray(form.subjects)) form.subjects = []
  // 三档价格兜底
  if (form.originalPrice == null) form.originalPrice = 0
  if (form.discountPrice == null) form.discountPrice = 0
  if (form.promotionPrice == null) form.promotionPrice = 0
  // 三档价格不变式：originalPrice > discountPrice > promotionPrice >= 0
  if (form.originalPrice <= 0) {
    return ElMessage.warning('原价必须大于 0')
  }
  if (form.discountPrice <= 0 || form.discountPrice >= form.originalPrice) {
    return ElMessage.warning('折扣价必须 > 0 且 < 原价')
  }
  if (form.promotionPrice < 0 || form.promotionPrice >= form.discountPrice) {
    return ElMessage.warning('活动价必须 >= 0 且 < 折扣价（0 表示免费赠课）')
  }
  if (form.promotionActive && form.promotionPrice <= 0) {
    return ElMessage.warning('启用活动时活动价不能为 0；如需免费赠课，请关闭活动开关并使用「赠课」功能')
  }
  saving.value = true
  try {
    const payload = { ...form }
    delete payload._id
    if (form._id) {
      await courseProductApi.update(form._id, payload)
      ElMessage.success('已更新')
    } else {
      await courseProductApi.create(payload)
      ElMessage.success('已创建')
    }
    dialog.value = false
    load()
  } finally {
    saving.value = false
  }
}

// ===== 课程附件：上传新 + 从库选 =====
const attachmentPicker = ref(false)
// id -> originalName 的回显 map。编辑模式下 form.attachments 是 ObjectId[]，
// 旧数据没 name；新选/新传的同步记到这里。MVP 不批量 storageApi.detail 回查。
const attachmentNames = reactive(new Map())
function attachmentName(id) {
  return attachmentNames.get(String(id)) || String(id).slice(-6)
}

function beforeAttachmentUpload(file) {
  if (file.size > 20 * 1024 * 1024) {
    ElMessage.error('附件超过 20MB 限制')
    return false
  }
  return true
}

async function uploadAttachment(req) {
  try {
    const { data } = await storageApi.upload({ file: req.file, scope: 'courseAttachment' })
    form.attachments.push(data.id)
    attachmentNames.set(String(data.id), data.originalName || data.id)
    ElMessage.success('附件已上传，点"确定"生效')
  } catch (e) {
    // axios 拦截器已 toast
  }
}

function onPickAttachments(files) {
  if (!Array.isArray(form.attachments)) form.attachments = []
  const existing = new Set(form.attachments.map(String))
  for (const f of files) {
    const id = String(f._id)
    if (!existing.has(id)) {
      form.attachments.push(id)
      attachmentNames.set(id, f.originalName || id)
      existing.add(id)
    }
  }
}

async function deactivate(row) {
  try {
    await ElMessageBox.confirm(
      `确认下架课程产品「${row.name}」吗？下架后不可在家长端展示与售卖。`,
      '请确认',
      { type: 'warning', confirmButtonText: '下架', cancelButtonText: '取消' }
    )
  } catch (_) { return }
  await courseProductApi.update(row._id, { isActive: false })
  ElMessage.success('已下架')
  load()
}

async function reactivate(row) {
  await courseProductApi.update(row._id, { isActive: true })
  ElMessage.success('已上架')
  load()
}

async function onRemoveConfirm(row, { password }) {
  try {
    await courseProductApi.remove(row._id, { password })
    ElMessage.success('已删除')
    load()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `课程产品 ${row.name}`)
  }
}

/* ----- 跨机构同步 ----- */

const syncDialog = ref(false)
const sourceOrgs = ref([])
const sourceOrgsLoading = ref(false)
const selectedSourceOrgId = ref('')
const sourceProducts = ref([])
const sourceProductsLoading = ref(false)
const existingNamesInCurrentOrg = ref(new Set())
const targetSubjectIds = ref(new Set()) // 当前机构已有 subject._id
const selectedProductIds = ref([])
const syncing = ref(false)
const syncTableRef = ref(null)

async function openSync() {
  syncDialog.value = true
  sourceOrgs.value = []
  selectedSourceOrgId.value = ''
  sourceProducts.value = []
  selectedProductIds.value = []
  // 预拉当前机构产品名 / 学科 id，用于 existsInCurrent / missing-subject 判定
  try {
    const [pr, sr] = await Promise.all([
      courseProductApi.list({ pageSize: 1000 }),
      subjectApi.list({ pageSize: 1000 })
    ])
    existingNamesInCurrentOrg.value = new Set((pr.data || []).map((p) => p.name))
    targetSubjectIds.value = new Set((sr.data || []).map((s) => String(s._id || s.id)))
  } catch (e) {
    // ignore; 弹窗继续打开
  }
  // 默认列前 20 个源机构
  await searchSourceOrgs('')
}

async function searchSourceOrgs(keyword) {
  sourceOrgsLoading.value = true
  try {
    const r = await courseProductApi.listSourceOrgs({ keyword })
    sourceOrgs.value = r.data.items || []
  } finally {
    sourceOrgsLoading.value = false
  }
}

async function onSourceOrgChange(orgId) {
  sourceProducts.value = []
  selectedProductIds.value = []
  if (!orgId) return
  sourceProductsLoading.value = true
  try {
    const r = await courseProductApi.listByOrg(orgId)
    const items = (r.data.items || []).map((p) => {
      // 兼容旧字段 `subject`（单值）和新字段 `subjects`（数组）
      const subjList = Array.isArray(p.subjects) && p.subjects.length
        ? p.subjects
        : (p.subject ? [p.subject] : [])
      const subjIds = subjList.map((s) => String(s._id || s.id || s))
      let skipReason = null
      if (existingNamesInCurrentOrg.value.has(p.name)) {
        skipReason = 'already-exists-in-target'
      } else if (subjIds.length && subjIds.some((id) => !targetSubjectIds.value.has(id))) {
        skipReason = 'missing-subject-in-target'
      }
      return {
        ...p,
        subjects: subjList, // 把拉到的学科信息统一回填到 subjects 字段
        existsInCurrent: !!skipReason,
        skipReason
      }
    })
    sourceProducts.value = items
    // 预选所有「可同步」行
    await nextTick()
    if (syncTableRef.value) {
      items
        .filter((p) => !p.skipReason)
        .forEach((row) => syncTableRef.value.toggleRowSelection(row, true))
    }
  } finally {
    sourceProductsLoading.value = false
  }
}

function onSelectionChange(rows) {
  selectedProductIds.value = rows.map((r) => r._id)
}

async function confirmSync() {
  if (!selectedProductIds.value.length) return
  const N = selectedProductIds.value.length
  try {
    await ElMessageBox.confirm(
      `将向当前机构创建 ${N} 个课程产品（与本公司不同名 / 同 subject），是否继续？`,
      '提示',
      { type: 'info' }
    )
  } catch {
    return
  }
  syncing.value = true
  try {
    const r = await courseProductApi.sync({
      sourceOrgId: selectedSourceOrgId.value,
      productIds: selectedProductIds.value
    })
    const { createdCount = 0, skippedCount = 0 } = r.data || {}
    ElMessage.success(`已创建 ${createdCount} 个，跳过 ${skippedCount} 个`)
    syncDialog.value = false
    load()
  } finally {
    syncing.value = false
  }
}

onMounted(() => {
  load()
  loadSubjects()
})
</script>

<style scoped>
.course-products-page { display: flex; flex-direction: column; gap: 12px; }
.header-card { border: none; }
.attachments {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 100%;
}
.attachment-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  background: #fafbfc;
}
.header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
}
.title { margin: 0 0 4px 0; font-size: 20px; }
.subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }

.sync-summary { margin-top: 12px; color: #606266; font-size: 13px; }
.target-org-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: #f5f7fa;
  border-radius: 6px;
  border: 1px dashed #dcdfe6;
  margin-bottom: 4px;
}
.target-org-bar .label { color: #909399; font-size: 13px; }
.target-org-bar .value { color: #303133; font-weight: 600; font-size: 14px; }

/* 价格展示 */
.price-cell { display: flex; flex-direction: column; gap: 2px; line-height: 1.4; }
.price-line { display: flex; align-items: center; gap: 4px; }
.muted { color: #909399; }
.strikethrough { text-decoration: line-through; }
.discount { color: #303133; font-weight: 600; }
.promo { color: #f56c6c; }
.promo .promo-price { font-weight: 600; margin-left: 4px; }

.form-hint {
  font-size: 12px;
  color: #909399;
  line-height: 1.4;
  margin-top: 4px;
}
</style>
