<template>
  <div class="page schedule-calendar-page">
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">排课日历</h2>
          <div class="subtitle">按时间块查看所有排课计划；点击事件可编辑详情。已完成的排课以绿色显示，进行中以橙色显示。</div>
        </div>
        <div class="header-actions">
          <el-button @click="$router.push('/schedule')">列表视图</el-button>
          <el-button type="primary" @click="openGenerateDialog()">为开班排课</el-button>
        </div>
      </div>
    </el-card>

    <el-card shadow="never" class="filter-card">
      <el-form inline :model="filters" class="filter-form" @submit.prevent>
        <el-form-item label="开班">
          <el-select
            v-model="filters.courseInstance"
            clearable filterable placeholder="全部"
            style="width: 220px"
            @change="reload"
          >
            <el-option
              v-for="c in courseInstances"
              :key="c._id"
              :label="courseInstanceLabel(c)"
              :value="c._id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="老师">
          <el-select
            v-model="filters.teacher"
            clearable filterable placeholder="全部"
            style="width: 160px"
            @change="reload"
          >
            <el-option
              v-for="t in teachers"
              :key="t.id"
              :label="t.realName || t.mobile"
              :value="t.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="教室">
          <el-select
            v-model="filters.room"
            clearable placeholder="全部"
            style="width: 140px"
            @change="reload"
          >
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
            v-model="filters.status"
            clearable placeholder="全部"
            style="width: 140px"
            @change="reload"
          >
            <el-option v-for="s in STATUS_OPTIONS" :key="s.value" :label="s.label" :value="s.value" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
        <el-form-item class="right">
          <el-tag size="small" type="info">共 {{ total }} 条</el-tag>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card shadow="never" class="calendar-card" v-loading="loading">
      <FullCalendar ref="calendarRef" :options="calendarOptions" />
    </el-card>

    <!-- 事件详情侧拉 -->
    <el-drawer
      v-model="drawerOpen"
      :title="drawerTitle"
      direction="rtl"
      size="480px"
      :destroy-on-close="false"
    >
      <div v-if="drawerEvent" class="event-detail">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="开班">
            {{ drawerEvent.courseInstance?.name || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="课次">
            第 {{ drawerEvent.lessonNo || '—' }} 课
          </el-descriptions-item>
          <el-descriptions-item label="老师">
            {{ drawerEvent.teacher || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="教室">
            {{ drawerEvent.room || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="计划时间">
            {{ formatRange(drawerEvent.start, drawerEvent.end) }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="statusType(drawerEvent.status)" size="small">
              {{ statusLabel(drawerEvent.status) }}
            </el-tag>
          </el-descriptions-item>
        </el-descriptions>
        <div class="drawer-actions">
          <el-button type="primary" @click="openEditFromDrawer">编辑排课</el-button>
          <el-button @click="drawerOpen = false">关闭</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 为开班排课（批量预览 + 生成） -->
    <ScheduleGenerateDialog
      v-model="generateDialog"
      :course-instance="generateTarget"
      @done="reload"
    />

    <!-- 编辑排课（单条） -->
    <ScheduleEditDialog
      v-model="editDialog"
      :schedule="editTarget"
      @done="onEditDone"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, watch, nextTick } from 'vue'
import FullCalendar from '@fullcalendar/vue3'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { ElMessage, ElMessageBox } from 'element-plus'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { courseInstanceApi } from '@/api/courseInstance'
import { userApi } from '@/api/user'
import { roomApi } from '@/api/room'
import { formatDate } from '@/utils/format'
import ScheduleGenerateDialog from './ScheduleGenerateDialog.vue'
import ScheduleEditDialog from './ScheduleEditDialog.vue'

const STATUS_OPTIONS = [
  { value: 'scheduled', label: '已排课' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' }
]
const STATUS_LABELS = {
  scheduled: '已排课', in_progress: '进行中', completed: '已完成', cancelled: '已取消'
}
const STATUS_TYPES = {
  scheduled: 'info', in_progress: 'warning', completed: 'success', cancelled: ''
}

function statusLabel(s) { return STATUS_LABELS[s] || s || '—' }
function statusType(s) { return STATUS_TYPES[s] || '' }
function courseInstanceLabel(c) {
  if (!c) return ''
  const product = c.courseProduct && c.courseProduct.name
  return c.name ? `${c.name}（${product || '?'}）` : (product || c._id)
}
function formatRange(s, e) {
  if (!s) return ''
  const a = formatDate(s, 'YYYY-MM-DD HH:mm')
  const b = e ? formatDate(e, 'HH:mm') : ''
  return b ? `${a} - ${b}` : a
}

// ─── 筛选 ──────────────────────────────────────
const filters = reactive({
  courseInstance: '',
  teacher: '',
  room: '',
  status: '',
  from: '',
  to: ''
})
const dateRange = ref([])
function onDateRangeChange(v) {
  if (Array.isArray(v) && v.length === 2) {
    filters.from = v[0]
    filters.to = v[1]
  } else {
    filters.from = ''
    filters.to = ''
  }
  reload()
}
function resetFilters() {
  filters.courseInstance = ''
  filters.teacher = ''
  filters.room = ''
  filters.status = ''
  filters.from = ''
  filters.to = ''
  dateRange.value = []
  reload()
}

// ─── 依赖数据 ──────────────────────────────────
const courseInstances = ref([])
const teachers = ref([])
const rooms = ref([])

// ─── 日历数据 / 配置 ────────────────────────────
const total = ref(0)
const loading = ref(false)
const calendarRef = ref(null)
const eventMap = new Map() // id -> event detail

const calendarOptions = reactive({
  plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
  initialView: 'timeGridWeek',
  locale: 'zh-cn',
  // 周一作为一周的第一天（周日放到最后）
  firstDay: 1,
  headerToolbar: {
    left: 'prev,next today',
    center: 'title',
    right: 'dayGridMonth,timeGridWeek,timeGridDay'
  },
  buttonText: { today: '今天', month: '月', week: '周', day: '日' },
  nowIndicator: true,
  slotMinTime: '07:00:00',
  slotMaxTime: '22:00:00',
  // 拖拽时吸附到整点/半点（FullCalendar slotDuration 默认 30min，自动吸附）
  slotDuration: '00:30:00',
  snapDuration: '00:30:00',
  allDaySlot: false,
  height: 'auto',
  expandRows: true,
  events: [],
  // 开启拖拽 + 调整时长：FullCalendar 的事件可拖、可改时长
  editable: true,
  eventStartEditable: true,
  eventDurationEditable: true,
  eventDidMount(info) {
    // 鼠标悬停时给老师 / 教室 / 课次附加到 title 属性
    const ev = eventMap.get(info.event.id)
    if (!ev) return
    const tip = [
      `第 ${ev.lessonNo || '?'} 课`,
      ev.courseInstance?.name || '',
      `${ev.teacher || '—'} / ${ev.room || '—'}`,
      formatRange(ev.start, ev.end)
    ].filter(Boolean).join('\n')
    info.el.setAttribute('title', tip)
  },
  eventClick(info) {
    openDrawer(info.event.id)
  },
  // 拖拽事件完成后弹"确认 / 取消"框，避免误操
  async eventDrop(info) {
    await confirmAndApplyTimeChange(info, '已更新排课时间')
  },
  // 调整时长（拖事件下边缘）：同样走确认流程
  async eventResize(info) {
    await confirmAndApplyTimeChange(info, '已更新排课时长')
  },
  datesSet() {
    // 切换视图 / 翻页时按当前可视区重新拉取
    reload()
  }
})

// ─── 抽屉详情 ──────────────────────────────────
const drawerOpen = ref(false)
const drawerEvent = ref(null)
const drawerTitle = ref('排课详情')
function openDrawer(id) {
  const ev = eventMap.get(id)
  if (!ev) return
  drawerEvent.value = ev
  drawerTitle.value = `第 ${ev.lessonNo || '?'} 课 · ${ev.courseInstance?.name || '排课'}`
  drawerOpen.value = true
}

function openEditFromDrawer() {
  const ev = drawerEvent.value
  if (!ev) return
  drawerOpen.value = false
  openEditDialog({ _id: ev.id, ...ev })
}

// ─── 弹窗 ──────────────────────────────────────
const generateDialog = ref(false)
const generateTarget = ref(null)
const editDialog = ref(false)
const editTarget = ref(null)
function openGenerateDialog(courseInstance) {
  generateTarget.value = courseInstance || null
  generateDialog.value = true
}
function openEditDialog(row) {
  editTarget.value = row
  editDialog.value = true
}
function onEditDone() {
  reload()
}

/**
 * 拖拽 / 改时长 后统一处理：弹确认/取消框。
 * - 确认 → 调 update 接口；失败时 revert() 复原
 * - 取消 / 关闭 → revert() 复原
 * - 锁 completed / cancelled 状态：直接 revert() + 提示
 *
 * @param {Object} info  FullCalendar 事件回调对象（含 event / oldEvent / revert）
 * @param {string} successMsg 成功后 toast 文案
 */
async function confirmAndApplyTimeChange(info, successMsg) {
  const ev = info.event
  const oldEv = info.oldEvent
  const id = ev.id
  // 锁状态：已完成 / 已取消 不允许拖动调整
  const curStatus = ev.extendedProps?.status
  if (curStatus === 'completed' || curStatus === 'cancelled') {
    info.revert()
    return ElMessage.warning(curStatus === 'completed' ? '已完成的排课不可调整时间' : '已取消的排课不可调整时间')
  }
  const newStart = ev.start
  const newEnd = ev.end
  if (!newStart || !newEnd) {
    info.revert()
    return
  }
  const oldRange = `${formatDate(oldEv.start, 'MM-DD HH:mm')}-${formatDate(oldEv.end, 'HH:mm')}`
  const newRange = `${formatDate(newStart, 'MM-DD HH:mm')}-${formatDate(newEnd, 'HH:mm')}`
  const lessonNo = ev.extendedProps?.lessonNo
  const title = lessonNo ? `第 ${lessonNo} 课时间变更确认` : '排课时间变更确认'
  const message = `原时间：${oldRange}\n新时间：${newRange}\n\n是否保存新时间？`
  try {
    await ElMessageBox.confirm(message, title, {
      type: 'warning',
      confirmButtonText: '保存新时间',
      cancelButtonText: '撤销修改'
    })
  } catch (_) {
    // 用户点"撤销修改"或关闭弹窗
    info.revert()
    return
  }
  try {
    await lessonScheduleApi.update(id, {
      plannedStartTime: newStart.toISOString(),
      plannedEndTime: newEnd.toISOString()
    })
    ElMessage.success(successMsg)
    // 静默更新本地缓存，避免整页 reload 闪烁
    const cached = eventMap.get(id)
    if (cached) {
      cached.start = newStart
      cached.end = newEnd
    }
  } catch (err) {
    info.revert()
    const dataConflicts = err?.response?.data?.data?.conflicts
    if (dataConflicts && dataConflicts.length) {
      const c = dataConflicts[0]
      ElMessage.error(`与「${c.courseInstance?.name || '?'}」第 ${c.lessonNo} 课冲突`)
    } else {
      ElMessage.error(err?.response?.data?.message || '保存失败')
    }
  }
}

// ─── 加载 ──────────────────────────────────────
function getCurrentRange() {
  const cal = calendarRef.value?.getApi?.()
  if (!cal) {
    const now = new Date()
    return {
      from: new Date(now.getTime() - 7 * 86400000),
      to: new Date(now.getTime() + 30 * 86400000)
    }
  }
  return {
    from: cal.view.activeStart,
    to: cal.view.activeEnd
  }
}

async function reload() {
  loading.value = true
  try {
    const { from, to } = getCurrentRange()
    const params = {
      from: from instanceof Date ? from.toISOString() : from,
      to: to instanceof Date ? to.toISOString() : to,
      // 2026-06 试听不再走排课系统, 日历默认不显示试听
      isTrialLesson: false
    }
    if (filters.courseInstance) params.courseInstance = filters.courseInstance
    if (filters.teacher) params.teacher = filters.teacher
    if (filters.room) params.room = filters.room
    if (filters.status) params.status = filters.status
    // 用户选的 from/to 比当前可视区更严时取更严的（更小 from / 更小 to）
    if (filters.from) {
      const f = new Date(filters.from)
      if (f > from) params.from = f.toISOString()
    }
    if (filters.to) {
      const t = new Date(filters.to + 'T23:59:59')
      if (t < to) params.to = t.toISOString()
    }
    const r = await lessonScheduleApi.calendar(params)
    const items = r.data || []
    total.value = items.length
    eventMap.clear()
    calendarOptions.events = items.map((e) => {
      eventMap.set(e.id, e)
      return {
        id: e.id,
        title: buildEventTitle(e),
        start: e.start,
        end: e.end,
        backgroundColor: eventColor(e.status, e.isTrialLesson),
        borderColor: eventColor(e.status, e.isTrialLesson),
        textColor: '#fff',
        extendedProps: e
      }
    })
  } catch (err) {
    ElMessage.error(err?.response?.data?.message || '加载排课失败')
  } finally {
    loading.value = false
  }
}

function buildEventTitle(e) {
  const course = e.courseInstance?.name || e.title || '排课'
  const no = e.lessonNo ? `#${e.lessonNo} ` : ''
  const who = `${e.teacher || '-'} / ${e.room || '-'}`
  // 招生试听 (2026-06): 试听课加 [试听] 前缀, 日历一眼可辨
  return `${e.isTrialLesson ? '[试听] ' : ''}${no}${course}\n${who}`
}

function eventColor(status, isTrialLesson) {
  // 招生试听 (2026-06): 试听课统一用浅橙色, 跟"进行中"区分 (进行中是 #e6a23c 橙色)
  if (isTrialLesson) return '#f0a020'   // 橙黄：试听课
  switch (status) {
    case 'completed': return '#67c23a'   // 绿：已完成
    case 'in_progress': return '#e6a23c' // 橙：进行中
    case 'cancelled': return '#909399'   // 灰：已取消
    case 'scheduled':
    default: return '#409eff'           // 蓝：已排课
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

onMounted(async () => {
  await loadDeps()
  await nextTick()
  reload()
})

// 监听筛选条件联动
watch(
  () => [filters.courseInstance, filters.teacher, filters.room, filters.status, filters.from, filters.to],
  () => { /* 触发由 @change 完成 */ }
)
</script>

<style scoped>
.schedule-calendar-page { display: flex; flex-direction: column; gap: 12px; }
.header-card, .filter-card, .calendar-card { border: none; }
.filter-card :deep(.el-form-item) { margin-bottom: 0; }
.header-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.title { margin: 0 0 4px 0; font-size: 20px; }
.subtitle { color: #909399; font-size: 13px; line-height: 1.6; }
.header-actions { display: flex; gap: 8px; flex-shrink: 0; }
.filter-form :deep(.right) { margin-left: auto; }

.event-detail { padding: 0 12px; }
.drawer-actions { display: flex; gap: 8px; margin-top: 16px; justify-content: flex-end; }

/* 让 FullCalendar 充满卡片 */
.calendar-card :deep(.fc) { background: #fff; border-radius: 8px; }
.calendar-card :deep(.fc-event) {
  cursor: pointer;
  white-space: pre-line;
  font-size: 12px;
  line-height: 1.35;
}
.calendar-card :deep(.fc-event:hover) { filter: brightness(1.05); }
</style>
