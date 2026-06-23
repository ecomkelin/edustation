<template>
  <div class="child-leads-page">
    <!-- 顶部筛选 (2026-06-19 扩展: 推广人/试听老师/咨询师 + 精确日期范围, 与近 N 天预设共存; 日期范围优先) -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-row">
        <!-- 状态多选 -->
        <el-select
          v-model="filters.status"
          placeholder="孩子状态 (多选, 默认全部)"
          multiple
          collapse-tags
          collapse-tags-tooltip
          clearable
          style="width: 220px"
          @change="onFilterChange"
        >
          <el-option
            v-for="(label, value) in CHILD_LEAD_STATUS_LABEL"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
        <!-- 时间预设 (兜底, 日期范围为空时生效) -->
        <el-select
          v-model="filters.range"
          placeholder="录入时间"
          style="width: 130px"
          @change="onRangeChange"
        >
          <el-option label="近 7 天" value="7d" />
          <el-option label="近 1 月" value="1m" />
          <el-option label="近 3 月" value="3m" />
          <el-option label="全部" value="all" />
        </el-select>
        <!-- 精确日期范围 (设置后覆盖预设) -->
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DD"
          unlink-panels
          style="width: 240px"
          @change="onFilterChange"
        />
        <!-- 试听科目类别 -->
        <el-select
          v-model="filters.trialSubject"
          placeholder="试听科目"
          clearable
          filterable
          style="width: 130px"
          @change="onFilterChange"
        >
          <el-option
            v-for="c in trialSubjectOptions"
            :key="c._id"
            :label="c.name"
            :value="c._id"
          />
        </el-select>
        <!-- 推广人 (Parent.promoteBy) -->
        <el-select
          v-model="filters.promoteBy"
          placeholder="推广人"
          clearable
          filterable
          style="width: 130px"
          @change="onFilterChange"
        >
          <el-option
            v-for="u in staffOptions"
            :key="u._id || u.id"
            :label="staffLabel(u)"
            :value="u._id || u.id"
          />
        </el-select>
        <!-- 试听老师 (ChildLead.inviteTeacher) -->
        <el-select
          v-model="filters.inviteTeacher"
          placeholder="试听老师"
          clearable
          filterable
          style="width: 130px"
          @change="onFilterChange"
        >
          <el-option
            v-for="u in staffOptions"
            :key="u._id || u.id"
            :label="staffLabel(u)"
            :value="u._id || u.id"
          />
        </el-select>
        <!-- 2026-06-21: 删"咨询师"筛选 (Parent.consultant 字段下线, 谈单老师挂到 TrialBooking) -->
        <!-- 关键词: 孩子姓名 -->
        <el-input
          v-model="filters.keyword"
          placeholder="孩子姓名"
          clearable
          style="width: 140px"
          @keyup.enter="onFilterChange"
          @clear="onFilterChange"
        />
        <!-- scope toggle: 仅平台超管显示 (后端 childLead.service 非超管强制 mine) -->
        <el-radio-group
          v-if="isPlatformAdmin"
          v-model="filters.scope"
          @change="onFilterChange"
        >
          <el-radio-button value="all">全部</el-radio-button>
          <el-radio-button value="mine">我录入的</el-radio-button>
        </el-radio-group>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>
        <div class="spacer" />
        <el-button
          v-if="hasPerm('recruit.write')"
          :icon="Download"
          @click="onDownloadTemplate"
        >下载模板</el-button>
        <el-button
          v-if="hasPerm('recruit.write')"
          type="primary"
          :icon="Upload"
          @click="importDialog.visible = true"
        >批量导入</el-button>
        <el-button type="primary" @click="openCreate">
          + 新建孩子
        </el-button>
      </div>
    </el-card>

    <!-- 列表 -->
    <el-card class="list-card" shadow="never">
      <el-table
        v-loading="loading"
        :data="rows"
        border
        stripe
        :empty-text="loading ? '加载中' : '暂无数据'"
      >
        <!-- 1. 孩子姓名 -->
        <el-table-column label="孩子姓名" min-width="100">
          <template #default="{ row }">
            <el-link type="primary" link @click="openDetail(row)">{{ row.name }}</el-link>
            <el-tag v-if="row.sameAs?.length" size="small" type="info" class="ml">跨年</el-tag>
            <el-tag v-if="row.sameParentCount > 1" size="small" effect="plain" class="ml">
              {{ row.sameParentRank }}/{{ row.sameParentCount }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 2. 状态 -->
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="statusTagType(row.status)" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>

        <!-- 3. 性别 / 年龄 -->
        <el-table-column label="性别/年龄" width="90">
          <template #default="{ row }">
            {{ genderLabel(row.gender) }} / {{ row.age ?? '-' }}
          </template>
        </el-table-column>

        <!-- 4. 学校 / 年级 -->
        <el-table-column label="学校年级" min-width="140">
          <template #default="{ row }">
            <div>{{ typeof row.school === 'object' ? (row.school?.name || '-') : (row.school || '-') }}</div>
            <div class="muted">{{ [row.grade, row.className].filter(Boolean).join(' / ') || '-' }}</div>
          </template>
        </el-table-column>

        <!-- 5. 试听科目 (后端 list 只 populate 第一个 trialSubject; 多余的 trialSubjects 数组在 detail 弹窗才展开) -->
        <el-table-column label="试听科目" min-width="100">
          <template #default="{ row }">
            <span v-if="row.trialSubject?.name">
              {{ row.trialSubject.name }}
              <span v-if="(row.trialSubjects?.length || 0) > 1" class="muted"> +{{ row.trialSubjects.length - 1 }}</span>
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <!-- 6. 所属家长 -->
        <el-table-column label="所属家长" min-width="170">
          <template #default="{ row }">
            <el-link
              v-if="row.parent?.phone"
              type="primary"
              link
              @click="openParentDetail(row)"
            >{{ row.parent.phone }}</el-link>
            <span v-else class="muted">-</span>
            <el-tag
              v-if="row.parent?.lifecycle"
              :type="lifecycleTagType(row.parent.lifecycle)"
              size="small"
              class="ml"
            >{{ lifecycleLabel(row.parent.lifecycle) }}</el-tag>
          </template>
        </el-table-column>

        <!-- 7. 最近试听 -->
        <el-table-column label="最近试听" width="120">
          <template #default="{ row }">
            <span v-if="row.latestBooking">
              {{ formatTime(row.latestBooking.scheduledAt) }}
              <el-tag :type="TRIAL_BOOKING_STATUS_TAG_TYPE[row.latestBooking.status]" size="small" class="ml">
                {{ TRIAL_BOOKING_STATUS_LABEL[row.latestBooking.status] }}
              </el-tag>
            </span>
            <span v-else class="muted">-</span>
          </template>
        </el-table-column>

        <!-- 8. 最近联系 -->
        <el-table-column label="最近联系" width="160">
          <template #default="{ row }">{{ formatTime(row.lastContactedAt) }}</template>
        </el-table-column>

        <!-- 9. 录入人 -->
        <el-table-column label="录入人" min-width="90">
          <template #default="{ row }">
            {{ row.createdBy?.realName || row.createdBy?.mobile || '-' }}
          </template>
        </el-table-column>

        <!-- 10. 操作 -->
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button size="small" link @click="openDetail(row)">详情</el-button>
            <el-button
              v-if="!['converted', 'lost'].includes(row.status) && hasPerm('recruit.write')"
              size="small"
              link
              type="primary"
              @click="openAddActivity(row)"
            >+ 触点</el-button>
            <el-button
              v-if="row.status === 'converted' && hasPerm('recruit.convert')"
              size="small"
              link
              type="success"
              @click="onUnconvert(row)"
            >撤销</el-button>
            <el-button
              v-if="hasPerm('recruit.write')"
              size="small"
              link
              @click="openEdit(row)"
            >编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="pagination.page"
        v-model:page-size="pagination.pageSize"
        :page-sizes="[20, 50, 100]"
        :total="total"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @size-change="load"
        @current-change="load"
      />
    </el-card>

    <!-- 新建孩子 (= ChildLeadEditDialog, parent=null 走 withChild) -->
    <ChildLeadEditDialog
      v-model:visible="createDialog.visible"
      :parent="null"
      @saved="onSaved"
      @open-existing="onOpenExisting"
    />

    <!-- 编辑单个孩子 -->
    <ChildLeadEditDialog
      v-model:visible="editDialog.visible"
      :parent="editDialog.parent"
      :child-lead="editDialog.childLead"
      @saved="onSaved"
    />

    <!-- 孩子详情 -->
    <ChildLeadDetailDialog
      v-model:visible="detailDialog.visible"
      :child-lead-id="detailDialog.childLeadId"
      @updated="load"
      @open-parent="onOpenParent"
      @open-sibling="onOpenSibling"
    />

    <!-- 家长详情 (反向跳转) -->
    <ParentDetailDialog
      v-model:visible="parentDialog.visible"
      :parent-id="parentDialog.parentId"
      @updated="load"
    />

    <!-- 记触点 -->
    <ActivityCreateDialog
      v-model:visible="activityDialog.visible"
      :child-lead-id="activityDialog.childLeadId"
      :child-name="activityDialog.childName"
      @saved="onActivitySaved"
    />

    <!-- 批量导入 (2026-06-20) -->
    <ChildLeadImportDialog
      v-model:visible="importDialog.visible"
      @imported="onImportDone"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Download, Upload } from '@element-plus/icons-vue'
import { childLeadApi } from '@/api/childLead'
import { categoryApi } from '@/api/category'
import { userApi } from '@/api/user'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import {
  CHILD_LEAD_STATUS_LABEL, CHILD_LEAD_STATUS_TAG_TYPE,
  TRIAL_BOOKING_STATUS_LABEL, TRIAL_BOOKING_STATUS_TAG_TYPE,
  PARENT_LIFECYCLE_LABEL, PARENT_LIFECYCLE_TAG_TYPE,
  GENDER_LABEL
} from '@/utils/constants'
import ChildLeadEditDialog from './ChildLeadEditDialog.vue'
import ChildLeadDetailDialog from './ChildLeadDetailDialog.vue'
import ParentDetailDialog from './ParentDetailDialog.vue'
import ActivityCreateDialog from './ActivityCreateDialog.vue'
import ChildLeadImportDialog from './ChildLeadImportDialog.vue'
import { downloadTemplate as downloadLeadTemplate } from '@/utils/leadImport'

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => !!authStore.user?.isPlatformAdmin)
const hasPerm = (code) => hasPermInOrg(authStore, code)

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const trialSubjectOptions = ref([])
const staffOptions = ref([]) // 本机构员工 (排除'家长'职位), 给 推广人/试听老师/咨询师 3 个 select 共用

const filters = reactive({
  status: [],
  range: '3m',
  dateRange: [], // [YYYY-MM-DD, YYYY-MM-DD] - 设置后覆盖 range 预设
  trialSubject: null,
  promoteBy: null,
  inviteTeacher: null,
  // 2026-06-21: 删 consultant 筛选 (Parent.consultant 字段下线)
  keyword: '',
  // 默认 'all' 让前端意图清晰; 后端 childLead.service 非超管仍会强制 mine, 此处传 all 不影响结果
  scope: 'all'
})
const pagination = reactive({ page: 1, pageSize: 20 })

const createDialog = reactive({ visible: false })
const editDialog = reactive({ visible: false, childLead: null, parent: null })
const detailDialog = reactive({ visible: false, childLeadId: null })
const parentDialog = reactive({ visible: false, parentId: null })
const activityDialog = reactive({ visible: false, childLeadId: null, childName: '' })
// 批量导入 (2026-06-20)
const importDialog = reactive({ visible: false })

// 2026-06-20: 批量导入"下载模板" — 走 utils 共用
function onDownloadTemplate() {
  downloadLeadTemplate()
}

// 批量导入完成 — 弹 toast + 刷新列表
function onImportDone(result) {
  ElMessage.success(
    `导入完成: 成功 ${result.successCount} (新建 ${result.created} / 加孩 ${result.addedToExisting}), 跳过 ${result.skipCount}, 失败 ${result.failCount}`
  )
  load()
}

// 2026-06-19: 把 range 预设 ('7d' / '1m' / '3m' / 'all') 翻译成 from (ISO Date 字符串)
//   'all' → null (后端不过滤时间)
//   其他 → now - 区间
// 后端 childLead.service 按 createdAt 过滤
function rangeToFrom(range) {
  if (!range || range === 'all') return null
  const d = new Date()
  if (range === '7d') d.setDate(d.getDate() - 7)
  else if (range === '1m') d.setMonth(d.getMonth() - 1)
  else if (range === '3m') d.setMonth(d.getMonth() - 3)
  else return null
  return d.toISOString()
}

onMounted(async () => {
  await Promise.all([loadSubjects(), loadStaff()])
  load()
})

async function loadSubjects() {
  try {
    const r = await categoryApi.list({ model: 'Subject', pageSize: 200 })
    trialSubjectOptions.value = r.data?.items || (Array.isArray(r.data) ? r.data : [])
  } catch (e) { trialSubjectOptions.value = [] }
}
// 2026-06-19: 拉本机构员工列表 (排除'家长'职位), 给 3 个 select 共用
async function loadStaff() {
  try {
    const r = await userApi.list({ pageSize: 200 })
    const all = r.data?.items || []
    staffOptions.value = all.filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
  } catch (e) { staffOptions.value = [] }
}

async function load() {
  loading.value = true
  try {
    const params = { ...filters, page: pagination.page, pageSize: pagination.pageSize }
    // status 是多选数组: 空数组不传 (避免拼空字符串), 非空 join 逗号
    if (Array.isArray(params.status)) {
      if (params.status.length === 0) delete params.status
      else params.status = params.status.join(',')
    }
    // 时间筛选: 日期范围优先; 否则退到预设
    delete params.range // 不直接发 range
    delete params.dateRange
    if (Array.isArray(filters.dateRange) && filters.dateRange.length === 2) {
      // 精确范围: 开始 00:00:00, 结束 23:59:59.999 (含当天)
      params.from = new Date(filters.dateRange[0] + 'T00:00:00.000Z').toISOString()
      params.to = new Date(filters.dateRange[1] + 'T23:59:59.999Z').toISOString()
    } else {
      const from = rangeToFrom(filters.range)
      if (from) params.from = from
    }
    // 删空值
    Object.keys(params).forEach((k) => {
      if (params[k] === '' || params[k] == null) delete params[k]
    })
    const r = await childLeadApi.list(params)
    rows.value = r.data?.items || []
    total.value = r.data?.total || 0
  } finally {
    loading.value = false
  }
}

function onFilterChange() {
  pagination.page = 1
  load()
}

// 预设变化 → 清掉精确日期 (两者互斥, 精确优先)
function onRangeChange() {
  filters.dateRange = []
  onFilterChange()
}

function onReset() {
  filters.status = []
  filters.range = '3m'
  filters.dateRange = []
  filters.trialSubject = null
  filters.promoteBy = null
  filters.inviteTeacher = null
  // 2026-06-21: 删 consultant 重置
  filters.keyword = ''
  filters.scope = 'all'
  pagination.page = 1
  load()
}

function staffLabel(u) {
  return `${u.realName || ''} (${u.mobile || ''})`.trim()
}

function openCreate() {
  createDialog.visible = true
}

function openEdit(row) {
  editDialog.childLead = row
  // parent 优先从 row.parent 取, 兜底为 null
  editDialog.parent = row.parent?._id ? row.parent : (row.parent || null)
  editDialog.visible = true
}

function openDetail(row) {
  detailDialog.childLeadId = row._id
  detailDialog.visible = true
}

function openParentDetail(row) {
  const pid = row.parent?._id || row.parent
  if (!pid) {
    ElMessage.warning('该孩子未关联家长')
    return
  }
  parentDialog.parentId = pid
  parentDialog.visible = true
}

function openAddActivity(row) {
  activityDialog.childLeadId = row._id
  activityDialog.childName = row.name
  activityDialog.visible = true
}

async function onUnconvert(row) {
  const ok = await ElMessageBox.confirm(
    `撤销 ${row.name} 的转化? (5 分钟内有效)`,
    '撤销转化',
    { type: 'warning' }
  ).catch(() => null)
  if (!ok) return
  try {
    await childLeadApi.unconvert(row._id)
    ElMessage.success('已撤销')
    load()
  } catch (e) {
    const msg = e.response?.data?.message || e.message || '撤销失败'
    ElMessage.error(`撤销失败: ${msg}`)
  }
}

function onSaved() {
  ElMessage.success('已保存')
  load()
}

function onActivitySaved() {
  load()
}

function onOpenExisting(parent) {
  // 软唯一命中 → 直接打开家长详情
  parentDialog.parentId = parent._id
  parentDialog.visible = true
}

function onOpenParent(parent) {
  // 孩子详情里的"所属家长"链接
  const pid = parent?._id || parent
  if (!pid) return
  parentDialog.parentId = pid
  parentDialog.visible = true
}

function onOpenSibling(sibling) {
  // 孩子详情里的兄弟切换 → 直接换 childLeadId, dialog 通过 watch props.childLeadId 自动 reload
  detailDialog.childLeadId = sibling._id
}

// === 标签 / 文本辅助 ===
function statusLabel(s) { return CHILD_LEAD_STATUS_LABEL[s] || s || '-' }
function statusTagType(s) { return CHILD_LEAD_STATUS_TAG_TYPE[s] || 'info' }
function lifecycleLabel(s) { return PARENT_LIFECYCLE_LABEL[s] || s || '-' }
function lifecycleTagType(s) { return PARENT_LIFECYCLE_TAG_TYPE[s] || 'info' }
function genderLabel(g) { return GENDER_LABEL[g] || g || '-' }
function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}
</script>

<style scoped>
.child-leads-page { padding: 16px; }
.filter-card { margin-bottom: 16px; }
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.filter-row .spacer { flex: 1; }
.list-card { margin-bottom: 16px; }
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.ml { margin-left: 4px; }
.muted { color: #909399; font-size: 12px; }
</style>