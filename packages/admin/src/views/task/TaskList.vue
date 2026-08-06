<template>
  <div class="page">
    <!-- 顶部统计卡片 + 视图切换 + 创建按钮 -->
    <div class="page__header">
      <div class="stats">
        <div class="stat" v-for="s in statsList" :key="s.key">
          <div class="stat__label">{{ s.label }}</div>
          <div class="stat__value" :class="s.cls">{{ s.value }}</div>
        </div>
      </div>
      <div class="actions">
        <!-- 2026-07-08: 已归档开关 -->
        <el-checkbox v-model="showArchived" @change="reload">显示已归档</el-checkbox>
        <el-radio-group v-model="view" size="default">
          <el-radio-button value="list">列表</el-radio-button>
          <el-radio-button value="kanban">看板(状态)</el-radio-button>
          <!-- 2026-08-06 P2.2: 第三档 — 看板按标签分组 (并列, 每标签列内嵌 4 状态子列) -->
          <el-radio-button value="kanbanByTag">看板(标签)</el-radio-button>
        </el-radio-group>
        <el-button type="primary" :icon="Plus" @click="$router.push('/tasks/new')" v-if="canCreate">新建任务</el-button>
      </div>
    </div>

    <!-- 筛选条 -->
    <div class="filters">
      <el-select v-model="filter.myRole" placeholder="我的角色" clearable style="width: 140px" @change="reload">
        <el-option label="我创建的" value="creator" />
        <el-option label="我执行的" value="assignee" />
        <el-option label="我监督的" value="supervisor" />
        <el-option label="全部" value="all" />
      </el-select>
      <el-select v-model="filter.status" placeholder="状态" clearable style="width: 140px" @change="reload">
        <el-option v-for="o in STATUS_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-select v-model="filter.type" placeholder="类型" clearable style="width: 120px" @change="reload">
        <el-option v-for="o in TYPE_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-select v-model="filter.priority" placeholder="优先级" clearable style="width: 120px" @change="reload">
        <el-option v-for="o in PRIORITY_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
      </el-select>
      <el-input v-model="filter.keyword" placeholder="搜索标题" clearable autocomplete="off" style="width: 200px" @keyup.enter="reload" @clear="reload" />
      <!-- 2026-08-06 P2.1: 多选标签 AND 筛选 (?tags=a,b → $all) — 与 P1.1 单值 ?tag= 区分 -->
      <el-select v-model="filter.tags" multiple collapse-tags collapse-tags-tooltip clearable filterable
        placeholder="按标签筛选 (多选=AND)" style="width: 240px" @change="reload">
        <el-option v-for="t in tagOptions" :key="t" :label="t" :value="t" />
      </el-select>
      <el-button @click="reload">查询</el-button>
      <!-- 2026-08-06: P1.1 — 当前标签筛选展示 + 一键清除 (参考 CLAUDE.md §8.2 archived 风格) -->
      <el-tag v-if="filter.tag" type="primary" closable @close="clearTag" style="margin-left: 8px">
        标签: {{ filter.tag }}
      </el-tag>
    </div>

    <!-- 列表视图 -->
    <el-table v-if="view === 'list'" :data="rows" v-loading="loading" @row-click="goDetail" stripe
      :row-class-name="rowCls">
      <el-table-column label="标题" min-width="240">
        <template #default="{ row }">
          <div class="title-cell">
            <span class="title-cell__title">{{ row.title }}</span>
            <el-tag v-if="row.fromTemplate" size="small" type="info" effect="plain">周期</el-tag>
            <el-tag v-if="row.archived" size="small" type="warning" effect="plain">已归档</el-tag>
          </div>
          <div v-if="row.tags && row.tags.length" class="title-cell__tags">
            <!-- 2026-08-06: P1.1 — chip 可点击 → 写入 ?tag=xxx 触发筛选, 当前选中高亮 primary -->
            <el-tag v-for="t in row.tags" :key="t" size="small" effect="plain"
              :type="filter.tag === t ? 'primary' : undefined"
              :class="{ 'title-cell__tag--active': filter.tag === t }"
              style="cursor: pointer"
              @click.stop="onTagClick(t)">{{ t }}</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="90">
        <template #default="{ row }">{{ typeLabels[row.type] || row.type }}</template>
      </el-table-column>
      <el-table-column label="优先级" width="80">
        <template #default="{ row }">
          <el-tag :type="priorityTagType(row.priority)" size="small">{{ priorityLabels[row.priority] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTagType(row.status)" size="small">{{ statusLabels[row.status] }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="进度" width="120">
        <template #default="{ row }">
          <el-progress :percentage="row.progress || 0" :stroke-width="8" />
        </template>
      </el-table-column>
      <el-table-column label="执行人" width="200">
        <template #default="{ row }">
          <div class="assignees">
            <el-tag v-for="a in row.assignees" :key="a.user._id || a.user"
              size="small" :type="a.status === 'submitted' ? 'success' : (a.status === 'in_progress' ? 'warning' : 'info')"
              effect="plain">
              {{ a.user.realName || a.user.name || a.user.id }} <span v-if="a.status === 'submitted'">✓</span>
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="监督人" width="160">
        <template #default="{ row }">
          <div class="assignees">
            <el-tag v-for="s in row.supervisors" :key="s._id || s"
              size="small" type="success" effect="plain">
              {{ s.realName || s.name || s.id }}
            </el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="发起人" width="90">
        <template #default="{ row }">{{ row.creator && (row.creator.realName || row.creator.name) }}</template>
      </el-table-column>
      <el-table-column label="到期" width="170">
        <template #default="{ row }">
          <span :class="{ 'overdue': isOverdue(row) }">{{ formatDate(row.dueAt) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link @click.stop="goDetail(row, showArchived)">详情</el-button>
          <el-button v-if="canArchiveRow(row) && !row.archived" size="small" link type="warning" @click.stop="onArchive(row)">归档</el-button>
          <el-button v-if="canArchiveRow(row) && row.archived" size="small" link @click.stop="onUnarchive(row)">取消归档</el-button>
          <el-button v-if="canArchiveRow(row)" size="small" link type="danger" @click.stop="onDelete(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>
    <el-pagination
      v-if="view === 'list'"
      class="pager"
      :current-page="page" :page-size="pageSize" :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      @current-change="onPage" @size-change="onPageSize" />

    <!-- 看板视图: 按状态分组 (原 4 列) -->
    <div v-if="view === 'kanban'" class="kanban" v-loading="loading">
      <div class="kanban__col" v-for="col in columns" :key="col.key">
        <div class="kanban__col-title">
          {{ col.label }} <el-badge :value="buckets[col.key].length" :max="99" />
        </div>
        <div class="kanban__list">
          <div v-for="t in buckets[col.key]" :key="t._id" class="kanban__card" @click="goDetail(t)">
            <div class="kanban__card-head">
              <span class="kanban__card-title">{{ t.title }}</span>
              <el-tag :type="priorityTagType(t.priority)" size="small">{{ priorityLabels[t.priority] }}</el-tag>
            </div>
            <el-progress v-if="t.progress" :percentage="t.progress" :stroke-width="4" />
            <div class="kanban__card-meta">
              <span v-for="a in t.assignees" :key="a.user._id || a.user" class="assignee-chip">
                {{ (a.user.realName || a.user.name || a.user.id || '').slice(0, 1) }}
              </span>
              <span class="kanban__card-due" :class="{ overdue: isOverdue(t) }">
                {{ formatDate(t.dueAt) }}
              </span>
            </div>
          </div>
          <div v-if="buckets[col.key].length === 0" class="kanban__empty">—</div>
        </div>
      </div>
    </div>

    <!-- 看板视图: 按标签分组 (P2.2) — 每个 tag 1 列, 内嵌 4 状态子列 (与按状态看板并列不互斥) -->
    <div v-else-if="view === 'kanbanByTag'" class="kanban" v-loading="loading">
      <!-- 顶部提示: 标签数 / 无标签数 / 折叠按钮 -->
      <div class="kanbanByTag__header">
        <span class="kanbanByTag__count">共 {{ kanbanByTagData.allTags.length }} 个标签</span>
        <el-button v-if="kanbanByTagData.untaggedCount > 0" link size="small" @click="view = 'kanban'">
          {{ kanbanByTagData.untaggedCount }} 个无标签任务 (切回状态看板查看)
        </el-button>
        <el-button v-if="kanbanByTagData.allTags.length > 8 && !showAllTagCols" link size="small" @click="showAllTagCols = true">
          展开更多 ({{ kanbanByTagData.allTags.length - 8 }}+)
        </el-button>
      </div>
      <div class="kanbanByTag__cols">
        <div class="kanbanByTag__col" v-for="tag in visibleTagCols" :key="tag">
          <div class="kanban__col-title">
            <el-tag type="primary" effect="plain" size="small">{{ tag }}</el-tag>
          </div>
          <div class="kanbanByTag__sub" v-for="col in columns" :key="col.key">
            <div class="kanbanByTag__sub-title">
              {{ col.label }} <el-badge :value="(kanbanByTagData.byTag[tag] || {})[col.key]?.length || 0" :max="99" />
            </div>
            <div class="kanban__list">
              <div v-for="t in (kanbanByTagData.byTag[tag] || {})[col.key] || []" :key="t._id" class="kanban__card" @click="goDetail(t)">
                <div class="kanban__card-head">
                  <span class="kanban__card-title">{{ t.title }}</span>
                  <el-tag :type="priorityTagType(t.priority)" size="small">{{ priorityLabels[t.priority] }}</el-tag>
                </div>
                <el-progress v-if="t.progress" :percentage="t.progress" :stroke-width="4" />
                <div class="kanban__card-meta">
                  <span v-for="a in t.assignees" :key="a.user._id || a.user" class="assignee-chip">
                    {{ (a.user.realName || a.user.name || a.user.id || '').slice(0, 1) }}
                  </span>
                  <span class="kanban__card-due" :class="{ overdue: isOverdue(t) }">
                    {{ formatDate(t.dueAt) }}
                  </span>
                </div>
              </div>
              <div v-if="!((kanbanByTagData.byTag[tag] || {})[col.key] || []).length" class="kanban__empty">—</div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!kanbanByTagData.allTags.length" class="kanban__empty" style="margin: 24px auto; text-align: center;">
        本机构暂无带标签的任务 — 先在创建/编辑时加几个标签,这里就有内容了
      </div>
    </div>

    <!-- 删除确认弹窗(超管+密码) -->
    <DestructiveConfirm ref="dcRef" entity-label="任务" @confirm="doDelete" />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { taskApi } from '@/api/task'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import {
  TASK_STATUSES, TASK_STATUS_LABELS,
  TASK_TYPES, TASK_TYPE_LABELS,
  TASK_PRIORITIES, TASK_PRIORITY_LABELS
} from '@shared/enums.mjs'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

// canonical pattern: 把 (TYPES, LABELS) 拍平为 [{value, label}] 数组
// 2026-07-13: 防御性 fallback + dev 警告 — 避免 Vite stale optimizeDeps cache
// (shared/enums.mjs 拿到旧版, TASK_STATUSES 等 undefined) 时整页 blank
// 一键修复: pnpm --filter admin clean:vite && pnpm --filter admin dev
const STATUS_OPTIONS = (TASK_STATUSES || []).map((v) => ({ value: v, label: TASK_STATUS_LABELS[v] || v }))
const TYPE_OPTIONS = (TASK_TYPES || []).map((v) => ({ value: v, label: TASK_TYPE_LABELS[v] || v }))
const PRIORITY_OPTIONS = (TASK_PRIORITIES || []).map((v) => ({ value: v, label: TASK_PRIORITY_LABELS[v] || v }))

if (import.meta.env.DEV && (!TASK_STATUSES || !TASK_TYPES || !TASK_PRIORITIES)) {
  // eslint-disable-next-line no-console
  console.warn(
    '[TaskList] 枚举未加载完整 (Vite stale cache). 跑 `pnpm --filter admin clean:vite && pnpm --filter admin dev` 重启.'
  )
}
// 模板里仍要用 statusLabels[task.status] 渲染 chip, 保留 LABELS 对象引用
const statusLabels = TASK_STATUS_LABELS
const typeLabels = TASK_TYPE_LABELS
const priorityLabels = TASK_PRIORITY_LABELS

const view = ref(['kanban', 'kanbanByTag'].includes(route.query.view) ? route.query.view : 'list')
// 2026-07-08: 归档开关 — 默认隐藏已归档, ?showArchived=true 进 archived tab
const showArchived = ref(route.query.archived === 'true')
const filter = ref({
  myRole: '',
  status: '',
  type: '',
  priority: '',
  keyword: '',
  // 2026-08-06: P1.1 — 列表 chip 点击写入的当前标签筛选 (单值, OR)
  tag: '',
  // 2026-08-06 P2.1: 多选标签 AND 筛选 (数组 → 后端 $all)
  tags: []
})
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const stats = ref({ mineTotal: 0, mineDue: 0, mineOverdue: 0, mineSubmitted: 0, mineReview: 0 })
const buckets = ref({ todo: [], inProgress: [], pendingReview: [], done: [] })
// 2026-08-06 P2.2: 按标签分组看板数据 (来自 ?view=byTag 复用 R-3913 端点)
const kanbanByTagData = ref({ byTag: {}, allTags: [], untaggedCount: 0 })
const showAllTagCols = ref(false)
// 默认前 8 个标签, 防横向滚动过长
const visibleTagCols = computed(() => {
  const all = kanbanByTagData.value.allTags
  return showAllTagCols.value || all.length <= 8 ? all : all.slice(0, 8)
})
// 2026-08-06 P1.2: 本机构历史标签 (去重 + zh-CN 字典序), 给 P2.1 多选 select options + P1.2 chip 联想
const tagOptions = ref([])

const canCreate = computed(() => hasPermInOrg(auth, 'task.write'))
// 2026-07-09: 列表页归档/取消归档/删除按钮也按 isCreator 收口, 跟 TaskDetail / 后端 service 对齐
//   旧版只看 task.delete 权限码 → 任何持有 task.delete 的人都能点, 点完后端 403, UX 割裂
//   现在改为: isCreator 或平台超管 → 显示按钮; 其他持有 task.delete 的人不能点 (业务上不是发起人就无权归档别人的任务)
const myId = computed(() => auth.user?.id)
const isPlatformAdmin = computed(() => !!auth.user?.isPlatformAdmin)
function canArchiveRow(row) {
  if (!row) return false
  return isPlatformAdmin.value || String(row.creator?._id || row.creator) === myId.value
}

const columns = [
  { key: 'todo', label: '待办' },
  { key: 'inProgress', label: '进行中' },
  { key: 'pendingReview', label: '待审核' },
  { key: 'done', label: '已完成' }
]

const statsList = computed(() => [
  { key: 'total', label: '我的未完结', value: stats.value.mineTotal, cls: 'stat__value--primary' },
  { key: 'due', label: '未到期', value: stats.value.mineDue, cls: '' },
  { key: 'overdue', label: '已逾期', value: stats.value.mineOverdue, cls: 'stat__value--danger' },
  { key: 'submitted', label: '我已提交', value: stats.value.mineSubmitted, cls: 'stat__value--success' },
  { key: 'review', label: '待我审', value: stats.value.mineReview, cls: 'stat__value--warning' }
])

function priorityTagType(p) {
  return { urgent: 'danger', high: 'warning', normal: 'primary', low: 'info' }[p]
}
function statusTagType(s) {
  return {
    draft: 'info', assigned: 'primary', in_progress: 'warning', partial_submitted: 'warning',
    submitted: 'success', approved: 'success', rejected: 'danger', expired: 'danger', cancelled: 'info'
  }[s]
}
function isOverdue(row) {
  return row.dueAt && new Date(row.dueAt) < new Date() && !['approved', 'cancelled', 'expired'].includes(row.status)
}
function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function reload() {
  if (view.value === 'list') await loadList()
  else if (view.value === 'kanban') await loadKanban()
  else if (view.value === 'kanbanByTag') await loadKanbanByTag()
  await loadStats()
}

// 2026-08-06: P1.1 — 列表 chip 点击 → 写入 ?tag= 触发后端过滤; 重复点同 tag 取消
function onTagClick(t) {
  if (filter.value.tag === t) {
    clearTag()
    return
  }
  filter.value.tag = t
  // 同步 URL, 方便分享筛选状态
  router.replace({ query: { ...route.query, tag: t || undefined } })
  reload()
}

function clearTag() {
  filter.value.tag = ''
  const { tag, ...rest } = route.query
  router.replace({ query: rest })
  reload()
}

async function loadList() {
  loading.value = true
  try {
    // 2026-08-06 P2.1: tags 数组 → 逗号串, 让后端走 $all
    const params = { ...filter.value, page: page.value, pageSize: pageSize.value, archived: showArchived.value }
    if (Array.isArray(params.tags) && params.tags.length) {
      params.tags = params.tags.join(',')
    }
    Object.keys(params).forEach((k) => { if (params[k] === '' || params[k] === null || params[k] === undefined) delete params[k] })
    const r = await taskApi.list(params)
    rows.value = r.data?.items || []
    total.value = r.data?.total || 0
  } finally {
    loading.value = false
  }
}

async function loadKanban() {
  loading.value = true
  try {
    const params = { scope: 'mine' }
    if (filter.value.assignee) params.assignee = filter.value.assignee
    if (filter.value.type) params.type = filter.value.type
    if (filter.value.priority) params.priority = filter.value.priority
    const r = await taskApi.kanban(params)
    buckets.value = r.data || { todo: [], inProgress: [], pendingReview: [], done: [] }
  } finally {
    loading.value = false
  }
}

// 2026-08-06 P2.2: 看板按标签分组 (?view=byTag, 复用 R-3913)
//   顶部用"无标签任务"提示(切回 status 看板), 8+ 标签折叠防横向滚动过长
async function loadKanbanByTag() {
  loading.value = true
  try {
    const params = { scope: 'mine', view: 'byTag' }
    if (filter.value.assignee) params.assignee = filter.value.assignee
    if (filter.value.type) params.type = filter.value.type
    if (filter.value.priority) params.priority = filter.value.priority
    const r = await taskApi.kanban(params)
    kanbanByTagData.value = r.data || { byTag: {}, allTags: [], untaggedCount: 0 }
    // untaggedCount: 不在前端再算 (后端没返), 默认 0; 用户在 view 切换提示里看 "无标签任务" 即可
    if (kanbanByTagData.value.untaggedCount == null) {
      kanbanByTagData.value.untaggedCount = 0
    }
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  const r = await taskApi.stats()
  stats.value = r.data || {}
}

function onPage(p) { page.value = p; loadList() }
function onPageSize(s) { pageSize.value = s; page.value = 1; loadList() }
function rowCls({ row }) { return row.archived ? 'row-archived' : '' }
function goDetail(row, fromArchivedTab = false) {
  // 2026-07-08: 从归档 tab 点详情, 详情要 includeArchived=true 才能查到
  const q = fromArchivedTab ? '?includeArchived=true' : ''
  router.push(`/tasks/${row._id}${q}`)
}

async function onArchive(row) {
  await taskApi.archive(row._id)
  ElMessage.success('已归档')
  await reload()
}
async function onUnarchive(row) {
  await taskApi.unarchive(row._id)
  ElMessage.success('已取消归档')
  await reload()
}

const dcRef = ref(null)
async function onDelete(row) {
  // 预检
  const check = await taskApi.removableCheck(row._id)
  if (!check.data?.canRemove) {
    ElMessage.warning((check.data?.blockers || []).map((b) => b.hint).join('；'))
    return
  }
  dcRef.value.open(row)
}
async function doDelete({ row, password }) {
  await taskApi.remove(row._id, { password })
  ElMessage.success('已删除')
  await reload()
}

watch(view, (v) => {
  router.replace({ query: { ...route.query, view: v } })
  reload()
})
watch(showArchived, (v) => {
  router.replace({ query: { ...route.query, archived: v ? 'true' : undefined } })
  reload()
})

onMounted(async () => {
  await reload()
  // 2026-08-06 P1.2: 加载标签历史, 给 P2.1 多选 select 提供 options
  try {
    const r = await taskApi.distinctTags()
    tagOptions.value = Array.isArray(r.data) ? r.data : []
  } catch (_) { /* 静默, 多选筛选用不到时也能走 */ }
})
</script>

<style scoped>
.page { padding: 16px; }
.page__header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; flex-wrap: wrap; gap: 12px; }
.stats { display: flex; gap: 12px; flex-wrap: wrap; }
.stat { background: #fff; padding: 10px 16px; border-radius: 6px; min-width: 110px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.stat__label { font-size: 12px; color: #909399; margin-bottom: 4px; }
.stat__value { font-size: 22px; font-weight: 600; }
.stat__value--primary { color: #409eff; }
.stat__value--danger { color: #f56c6c; }
.stat__value--success { color: #67c23a; }
.stat__value--warning { color: #e6a23c; }
.actions { display: flex; gap: 12px; align-items: center; }
.filters { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.pager { margin-top: 12px; text-align: right; }
.title-cell { display: flex; gap: 6px; align-items: center; }
.title-cell__title { font-weight: 500; }
.title-cell__tags { display: flex; gap: 4px; margin-top: 4px; }
.assignees { display: flex; gap: 4px; flex-wrap: wrap; }
.overdue { color: #f56c6c; font-weight: 500; }

.kanban { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 12px; }
.kanban__col { background: #f5f7fa; border-radius: 6px; padding: 8px; min-width: 260px; max-width: 320px; }
.kanban__col-title { font-weight: 600; padding: 4px 8px; display: flex; justify-content: space-between; align-items: center; }
.kanban__list { display: flex; flex-direction: column; gap: 8px; min-height: 200px; }
.kanban__card { background: #fff; border-radius: 4px; padding: 10px; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05); }
.kanban__card:hover { box-shadow: 0 2px 6px rgba(0,0,0,0.1); }
.kanban__card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 6px; margin-bottom: 6px; }
.kanban__card-title { font-weight: 500; font-size: 14px; flex: 1; }
.kanban__card-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; font-size: 12px; color: #909399; }
.kanban__card-due.overdue { color: #f56c6c; font-weight: 500; }

/* 2026-07-08: 归档行整体灰一档, 一眼能看出"已归档" */
:deep(.el-table__row.row-archived) {
  color: #909399;
  background-color: #fafafa;
}
:deep(.el-table__row.row-archived:hover > td.el-table__cell) {
  background-color: #f0f0f0 !important;
}
.kanban__empty { color: #c0c4cc; text-align: center; padding: 20px; font-size: 13px; }
.assignee-chip { display: inline-block; width: 22px; height: 22px; line-height: 22px; text-align: center; border-radius: 50%; background: #409eff; color: #fff; font-size: 12px; margin-right: 2px; }
</style>