<template>
  <div class="page schedule-list-page">
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">排课</h2>
          <div class="subtitle">按课节安排老师、教室、时间。可按开班 / 老师 / 教室 / 日期 筛选。</div>
        </div>
        <div class="header-actions">
          <el-button @click="$router.push('/schedule/calendar')">日历视图</el-button>
          <el-button type="primary" @click="openGenerateDialog()">为开班排课</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="filter-card">
      <el-form inline :model="filters" class="filter-form" @submit.prevent>
        <el-form-item label="开班">
          <el-select v-model="filters.courseInstance" clearable filterable placeholder="全部" style="width: 220px" @change="load">
            <el-option v-for="c in courseInstances" :key="c._id" :label="courseInstanceLabel(c)" :value="c._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="老师">
          <el-select v-model="filters.teacher" clearable filterable placeholder="全部" style="width: 160px" @change="load">
            <el-option v-for="t in teachers" :key="t.id" :label="t.realName || t.mobile" :value="t.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="教室">
          <el-select v-model="filters.room" clearable placeholder="全部" style="width: 140px" @change="load">
            <el-option v-for="r in rooms" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期">
          <el-date-picker
            v-model="dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DD"
            style="width: 240px"
            @change="onDateRangeChange"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filters.statuses"
            multiple collapse-tags collapse-tags-tooltip
            placeholder="全部"
            style="width: 220px"
            @change="load"
          >
            <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table :data="items" v-loading="loading" border style="margin-top: 12px" @row-click="onRowClick">
      <el-table-column label="课次" width="70" prop="lessonNo" />
      <el-table-column label="开班" min-width="200">
        <template #default="{ row }">
          <div class="cell-strong">
            {{ row.courseInstance && row.courseInstance.name || '—' }}
            <el-tag v-if="row.isTrialLesson" type="warning" size="small" style="margin-left: 6px">试听</el-tag>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="老师" width="110">
        <template #default="{ row }">
          <span v-if="row.teacher">{{ row.teacher.realName || row.teacher.mobile }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="教室" width="100">
        <template #default="{ row }">
          <span v-if="row.room">{{ row.room.name }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="计划时间" width="190">
        <template #default="{ row }">
          <div
            class="time-cell"
            draggable="true"
            @dragstart="onTimeDragStart($event, row)"
            @dragend="onTimeDragEnd"
          >
            <div class="time-cell-row">
              <span class="drag-handle" title="按住拖到右侧时间刻度尺调整开始时间">⋮⋮</span>
              <div>
                <div>{{ formatDate(row.plannedStartTime, 'YYYY-MM-DD') }} ({{ weekdayCN(row.plannedStartTime) }})</div>
                <div class="muted">{{ formatDate(row.plannedStartTime, 'HH:mm') }} - {{ formatDate(row.plannedEndTime, 'HH:mm') }}</div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="实际上课时间" width="190">
        <template #default="{ row }">
          <template v-if="row.actualStartTime">
            <div>{{ formatDate(row.actualStartTime, 'YYYY-MM-DD') }} ({{ weekdayCN(row.actualStartTime) }})</div>
            <div class="muted">
              {{ formatDate(row.actualStartTime, 'HH:mm') }}
              <template v-if="row.actualEndTime">
                - {{ formatDate(row.actualEndTime, 'HH:mm') }}
              </template>
            </div>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="差(天)" width="100">
        <template #default="{ row }">
          <el-tag v-if="diffDays(row) === null" type="info" size="small">未上</el-tag>
          <el-tag v-else-if="diffDays(row) === 0" type="success" size="small">准时</el-tag>
          <el-tag v-else-if="diffDays(row) < 0" size="small" type="primary">{{ diffDays(row) }} 天</el-tag>
          <el-tag v-else-if="diffDays(row) <= 3" size="small" type="warning">+{{ diffDays(row) }} 天</el-tag>
          <el-tag v-else size="small" type="danger">+{{ diffDays(row) }} 天</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="差(分)" width="120">
        <template #default="{ row }">
          <template v-if="diffMinutes(row) === null">
            <span class="muted">—</span>
          </template>
          <template v-else>
            <el-tag size="small" :type="diffMinutes(row) >= 5 ? 'warning' : 'success'">
              {{ diffMinutes(row) > 0 ? '+' : '' }}{{ diffMinutes(row) }} 分
            </el-tag>
            <el-tooltip v-if="diffReason(row)" :content="diffReason(row)" placement="top">
              <el-icon class="reason-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row.status)" size="small">{{ statusLabel(row.status) }}</el-tag>
          <el-tooltip v-if="row.remindStatus && row.remindStatus !== 'none'" :content="remindTooltip(row)" placement="top">
            <el-icon class="remind-icon"><BellFilled /></el-icon>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="100" fixed="right">
        <template #default="{ row }">
          <!-- 排课页面只保留编辑入口；状态管理（转预备/开课/结束/归档/删除）统一在「上课表」页面。 -->
          <el-button size="small" @click.stop="openEditDialog(row)">编辑</el-button>
        </template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        background
        layout="total, prev, pager, next, sizes"
        :total="total"
        :page-size="filters.pageSize"
        :current-page="filters.page"
        :page-sizes="[20, 50, 100]"
        @current-change="(p) => { filters.page = p; load() }"
        @size-change="(s) => { filters.pageSize = s; filters.page = 1; load() }"
      />
    </div>

    <!-- 为开班排课（批量预览 + 生成） -->
    <ScheduleGenerateDialog
      v-model="generateDialog"
      :course-instance="generateTarget"
      @done="onGenerateDone"
    />

    <!-- 编辑排课（单条） -->
    <ScheduleEditDialog
      v-model="editDialog"
      :schedule="editTarget"
      @done="load"
    />

    <!-- 右侧时间刻度尺（拖拽改时间）：将排课的「计划时间」拖到这里吸附到整点/半点 -->
    <div
      v-show="dragRow"
      class="time-ruler"
      :class="{ 'is-drag-over': dragOverRuler }"
      @dragover.prevent="onRulerDragOver"
      @dragleave="onRulerDragLeave"
      @drop.prevent="onRulerDrop"
    >
      <div class="ruler-title">时间刻度</div>
      <div class="ruler-hint">拖动「计划时间」到这里<br/>吸附到整点 / 半点</div>
      <div class="ruler-track" ref="rulerTrack">
        <div
          v-for="t in rulerTicks"
          :key="t"
          class="ruler-tick"
          :data-time="t"
          :class="{ 'is-major': t.endsWith(':00'), 'is-active': hoverTime === t }"
        >{{ t }}</div>
      </div>
      <div v-if="hoverTime" class="ruler-preview">
        → {{ hoverTime }}
      </div>
    </div>

    <!-- 「开课」考勤登记抽屉已迁移到上课表页面（ClassSchedulePage），
         排课页面不再提供此入口。 -->
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { InfoFilled, BellFilled } from '@element-plus/icons-vue'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { courseInstanceApi } from '@/api/courseInstance'
import { userApi } from '@/api/user'
import { roomApi } from '@/api/room'
import { formatDate } from '@/utils/format'
import ScheduleGenerateDialog from './ScheduleGenerateDialog.vue'
import ScheduleEditDialog from './ScheduleEditDialog.vue'
// AttendanceRosterDialog 入口已迁移到 ClassSchedulePage.vue（上课表页面）

const STATUS_OPTIONS = [
  { value: 'scheduled', label: '未上课' },
  { value: 'preparing', label: '准备上课' },
  { value: 'in_progress', label: '正在上课' },
  { value: 'completed', label: '结束上课' },
  { value: 'archived', label: '完成归档' },
  { value: 'cancelled', label: '已取消' }
]
const STATUS_LABELS = {
  scheduled: '未上课',
  preparing: '准备上课',
  in_progress: '正在上课',
  completed: '结束上课',
  archived: '完成归档',
  cancelled: '已取消'
}
const STATUS_TYPES = {
  scheduled: 'info',
  preparing: '',
  in_progress: 'warning',
  completed: 'success',
  archived: 'success',
  cancelled: ''
}
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

function statusLabel(s) { return STATUS_LABELS[s] || s }
function statusType(s) { return STATUS_TYPES[s] || '' }
function weekdayCN(d) {
  if (!d) return ''
  return WEEKDAYS[new Date(d).getDay()]
}
function courseInstanceLabel(c) {
  if (!c) return ''
  const product = c.courseProduct && c.courseProduct.name
  return c.name ? `${c.name}（${product || '?'}）` : (product || c._id)
}

/**
 * 差(天)：计划开始日期 vs 实际开始日期（按"日历日"差，忽略时分秒）
 *  - 0 = 准时
 *  - 正数 = 延后 N 天
 *  - 负数 = 提前 N 天
 *  - null = 未上（没有 actualStartTime）
 */
function diffDays(row) {
  if (!row.actualStartTime) return null
  const a = new Date(row.plannedStartTime)
  const b = new Date(row.actualStartTime)
  const aDay = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())
  const bDay = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())
  return Math.round((bDay - aDay) / 86400000)
}

/**
 * 差(分)：actualStartTime 与 plannedStartTime 的分钟差（实际 - 计划）
 *  - 正数 = 延后 N 分钟；负数 = 提前 N 分钟
 *  - null = 未上
 *  - |diff| ≥ 5 分钟时应在列表/抽屉里展示理由
 */
function diffMinutes(row) {
  if (!row.actualStartTime) return null
  return Math.round((new Date(row.actualStartTime) - new Date(row.plannedStartTime)) / 60000)
}

/** 取出该行 actualStartReason（5 分钟差异理由），无则空字符串 */
function diffReason(row) {
  if (!row.actualStartTime) return ''
  const abs = Math.abs(diffMinutes(row) || 0)
  if (abs < 5) return ''
  return row.actualStartReason || ''
}

// 状态管理按钮（canPrepare / onPrepare / onStartLesson / onStart / onFinish / onRemove）
// 已迁移到 ClassSchedulePage.vue（上课表页面），排课页面仅保留编辑入口。

/** 提醒 tooltip */
function remindTooltip(row) {
  if (!row.remindedAt) return row.remindStatus === 'partial' ? '部分学生已提醒' : '已提醒'
  return `已提醒（${formatDate(row.remindedAt, 'YYYY-MM-DD HH:mm')}）`
}

const filters = reactive({
  courseInstance: '',
  teacher: '',
  room: '',
  // 状态多选；默认只看「未上课」(scheduled)
  statuses: ['scheduled'],
  from: '',
  to: '',
  page: 1,
  pageSize: 20
})
// 默认日期窗口:7 天前 0 点 起 30 天(到 today+29d 的 0 点)。
// 用本地日期生成 YYYY-MM-DD 串(避开 toISOString 的 UTC 漂移)。
function ymd(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function defaultDateRange() {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - 7)       // 7 天前的本地 0 点
  const end = new Date(start)
  end.setDate(end.getDate() + 30)          // 30 天窗口(含起日共 30 天)
  return [ymd(start), ymd(end)]
}
const [defaultFrom, defaultTo] = defaultDateRange()
const dateRange = ref([defaultFrom, defaultTo])
filters.from = defaultFrom
filters.to = defaultTo

function onDateRangeChange(v) {
  if (Array.isArray(v) && v.length === 2) {
    filters.from = v[0]
    filters.to = v[1]
  } else {
    filters.from = ''
    filters.to = ''
  }
  filters.page = 1
  load()
}

const items = ref([])
const total = ref(0)
const loading = ref(false)
const courseInstances = ref([])
const teachers = ref([])
const rooms = ref([])

// 弹窗
const generateDialog = ref(false)
const generateTarget = ref(null)
const editDialog = ref(false)
const editTarget = ref(null)
// 「开课」考勤登记抽屉已迁移到 ClassSchedulePage（上课表），此处不再持有 rosterDialog / rosterTarget

// 拖拽改时间
const dragRow = ref(null)             // 当前正在拖动的 row
const dragOverRuler = ref(false)      // 鼠标是否在刻度尺上
const hoverTime = ref('')             // 当前鼠标位置吸附的时间（HH:mm）
const rulerTicks = (() => {
  const arr = []
  for (let h = 0; h < 24; h++) {
    arr.push(`${String(h).padStart(2, '0')}:00`)
    arr.push(`${String(h).padStart(2, '0')}:30`)
  }
  return arr
})()
const rulerTrack = ref(null)

function openGenerateDialog(courseInstance) {
  generateTarget.value = courseInstance || null
  generateDialog.value = true
}
function openEditDialog(row) {
  editTarget.value = row
  editDialog.value = true
}
function onRowClick(row) {
  // 拖拽过程中不响应行点击（避免误开抽屉）
  if (dragRow.value) return
  openEditDialog(row)
}

// ─── 拖拽：把「计划时间」拖到右侧时间刻度尺吸附 ─────────
function onTimeDragStart(e, row) {
  // 不允许拖 cancelled / completed（completed 锁死修改；cancelled 已废）
  if (row.status === 'completed' || row.status === 'cancelled') {
    e.preventDefault()
    return
  }
  dragRow.value = row
  // 拖动时让浏览器显示一个自定义幽灵（半透明"时间"字样）
  try {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', row._id)
  } catch (_) { /* ignore */ }
  // 阻止冒泡触发 el-table 的行点击
  e.stopPropagation()
}

function onTimeDragEnd() {
  dragRow.value = null
  dragOverRuler.value = false
  hoverTime.value = ''
}

// 鼠标在刻度尺上移动时，根据 Y 坐标算吸附到哪个整点/半点
function computeHoverTimeFromEvent(e) {
  const track = rulerTrack.value
  if (!track) return ''
  const rect = track.getBoundingClientRect()
  if (rect.height <= 0) return ''
  const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top))
  // 0..23:30 共 48 个刻度 → index
  const idx = Math.floor((y / rect.height) * 48)
  const safe = Math.max(0, Math.min(47, idx))
  return rulerTicks[safe]
}

function onRulerDragOver(e) {
  dragOverRuler.value = true
  hoverTime.value = computeHoverTimeFromEvent(e)
}

function onRulerDragLeave(e) {
  // 仅当离开整个 ruler 容器时才清空
  if (e.currentTarget.contains(e.relatedTarget)) return
  dragOverRuler.value = false
  hoverTime.value = ''
}

async function onRulerDrop(e) {
  dragOverRuler.value = false
  const row = dragRow.value
  if (!row) return
  const time = computeHoverTimeFromEvent(e) || hoverTime.value
  dragRow.value = null
  if (!time) return
  // 计算新 start：保留原日期，只换 HH:mm
  const oldStart = new Date(row.plannedStartTime)
  const [hh, mm] = time.split(':').map(Number)
  const newStart = new Date(oldStart)
  newStart.setHours(hh, mm, 0, 0)
  // 计算 minutesPerLesson：优先开班 schedulePlan / courseProduct，否则用本行原 end-start，再 fallback 90
  // 注意：list 接口不返回 schedulePlan；fallback 顺序保证拖拽即用、不阻塞
  const ci = courseInstances.value.find((c) => String(c._id) === String(row.courseInstance?._id || row.courseInstance))
  const originalMinutes = Math.max(
    15,
    Math.round((new Date(row.plannedEndTime) - new Date(row.plannedStartTime)) / 60000)
  )
  const minutes = (ci && ci.schedulePlan && ci.schedulePlan.minutesPerLesson)
    || (ci && ci.courseProduct && ci.courseProduct.minutesPerLesson)
    || originalMinutes
    || 90
  const newEnd = new Date(newStart.getTime() + minutes * 60000)
  // 立即更新 UI（乐观更新）
  const oldStartISO = row.plannedStartTime
  const oldEndISO = row.plannedEndTime
  row.plannedStartTime = newStart.toISOString()
  row.plannedEndTime = newEnd.toISOString()
  try {
    await lessonScheduleApi.update(row._id, {
      plannedStartTime: row.plannedStartTime,
      plannedEndTime: row.plannedEndTime
    })
    ElMessage.success(`已调整第 ${row.lessonNo} 课时间为 ${time}`)
  } catch (err) {
    // 回滚 + 提示
    row.plannedStartTime = oldStartISO
    row.plannedEndTime = oldEndISO
    const dataConflicts = err?.response?.data?.data?.conflicts
    if (dataConflicts && dataConflicts.length) {
      const first = dataConflicts[0]
      ElMessage.error(`与「${first.courseInstance?.name || '?'}」第 ${first.lessonNo} 课冲突`)
    } else {
      ElMessage.error(err?.response?.data?.message || '改时间失败')
    }
  }
}

function resetFilters() {
  filters.courseInstance = ''
  filters.teacher = ''
  filters.room = ''
  filters.statuses = ['scheduled']
  // 回到默认日期窗口(7 天前 0 点 起 30 天),而不是清空
  const [df, dt] = defaultDateRange()
  dateRange.value = [df, dt]
  filters.from = df
  filters.to = dt
  filters.page = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const params = {
      page: filters.page,
      pageSize: filters.pageSize
    }
    if (filters.courseInstance) params.courseInstance = filters.courseInstance
    if (filters.teacher) params.teacher = filters.teacher
    if (filters.room) params.room = filters.room
    if (Array.isArray(filters.statuses) && filters.statuses.length) {
      params.statuses = filters.statuses.join(',')
    }
    if (filters.from) params.from = filters.from
    if (filters.to) params.to = filters.to
    const r = await lessonScheduleApi.list(params)
    items.value = r.data.items
    total.value = r.data.total
  } finally {
    loading.value = false
  }
}

async function loadDeps() {
  const [ci, u, rm] = await Promise.all([
    courseInstanceApi.list({ pageSize: 500 }),
    userApi.list({ pageSize: 200 }),
    roomApi.list()
  ])
  courseInstances.value = (ci.data || []).filter((c) => c.status !== 'cancelled')
  teachers.value = (u.data?.items || []).filter((x) => x.positions?.some((p) => p.name === '老师'))
  rooms.value = rm.data || []
}

function onGenerateDone() {
  load()
}

onMounted(() => {
  load()
  loadDeps()
})
</script>

<style scoped>
.schedule-list-page { display: flex; flex-direction: column; gap: 12px; }
.header-card, .filter-card { border: none; }
.filter-card :deep(.el-form-item) { margin-bottom: 0; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.title { margin: 0 0 4px 0; font-size: 20px; }
.subtitle { color: #909399; font-size: 13px; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.cell-strong { font-weight: 600; color: #303133; }
.muted { color: #909399; font-size: 12px; }
.pager {
  display: flex;
  justify-content: flex-end;
  padding: 12px 0;
}
/* 行可点击（编辑） */
.el-table :deep(.el-table__row) { cursor: pointer; }
.el-table :deep(.el-table__row:hover) { background-color: #f5f7fa; }

/* 拖拽改时间：单元格 + 手柄 */
.time-cell {
  cursor: grab;
  user-select: none;
  border-radius: 4px;
  padding: 4px 6px;
  transition: background-color 0.15s;
}
.time-cell:hover { background-color: #ecf5ff; }
.time-cell:active { cursor: grabbing; background-color: #d9ecff; }
.time-cell-row {
  display: flex; align-items: center; gap: 6px;
}
.drag-handle {
  color: #909399; font-weight: 700; letter-spacing: -2px;
  flex-shrink: 0;
}

/* 右侧时间刻度尺 */
.time-ruler {
  position: fixed;
  top: 80px;
  right: 16px;
  width: 80px;
  max-height: calc(100vh - 120px);
  background: #ffffff;
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  padding: 8px 6px;
  z-index: 200;
  user-select: none;
}
.time-ruler.is-drag-over {
  border-color: #409eff;
  background: #ecf5ff;
}
.ruler-title {
  font-size: 12px; font-weight: 600; color: #303133;
  text-align: center; margin-bottom: 4px;
}
.ruler-hint {
  font-size: 11px; color: #909399; text-align: center;
  line-height: 1.4; margin-bottom: 8px;
}
.ruler-track {
  position: relative;
  height: 480px; /* 24h * 20px/h，每格 20px；半小时 10px */
  border-left: 2px solid #409eff;
  padding-left: 6px;
  overflow: hidden;
}
.ruler-tick {
  height: 10px;
  line-height: 10px;
  font-size: 10px;
  color: #c0c4cc;
  border-bottom: 1px dashed #f0f0f0;
  transition: all 0.1s;
}
.ruler-tick.is-major {
  color: #606266;
  font-weight: 600;
  border-bottom-color: #e4e7ed;
}
.ruler-tick.is-active {
  color: #ffffff;
  background: #409eff;
  border-radius: 3px;
  font-weight: 700;
}
.ruler-preview {
  margin-top: 6px;
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  color: #409eff;
}

/* 列表列内辅助图标 */
.reason-icon { margin-left: 4px; color: #e6a23c; font-size: 14px; vertical-align: middle; cursor: help; }
.remind-icon { margin-left: 4px; color: #409eff; font-size: 14px; vertical-align: middle; cursor: help; }
</style>
