<template>
  <div class="page schedule-calendar-page">
    <el-card shadow="never" class="header-card">
      <div class="header-row">
        <div>
          <h2 class="title">排课日历</h2>
          <div class="subtitle">按时间块查看所有排课计划；点击事件可编辑详情。已完成的排课以绿色显示，进行中以橙色显示。</div>
        </div>
        <div class="header-actions">
          <!-- 2026-06-26: 视图切换 pill; 当前路由为 /schedule 时日历 active, /schedule/list 时列表 active。
               入口合并: 日历只读, 列表承担编辑/批量/补齐名单/为开班排课. -->
          <div class="view-toggle">
            <button
              type="button"
              class="view-toggle__btn is-active"
              disabled
            >
              日历视图
            </button>
            <button
              type="button"
              class="view-toggle__btn"
              @click="goToScheduleList"
            >
              列表视图
            </button>
          </div>
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
        <!-- 2026-06-26: 状态筛选改多选, 跟原 ClassSchedulePage 一致:
             教务通常想同时看「准备中+预备+进行中」三类「还没结的课」, 单选下拉太受限。
             collapse-tags 让选中的多个 tag 折叠成 "+N" 形状, 节省顶部空间。 -->
        <el-form-item label="状态">
          <el-select
            v-model="filters.statuses"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="全部"
            style="width: 220px"
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

    <!--
      2026-06-26: 事件详情侧拉改成 AttendanceRosterDialog，跟「上课表」列表页点详情一致：
      打开就是开课考勤登记（学生名单 + 考勤单选 + 课评），不再只是一个信息描述 + 编辑按钮。
      - 跟 ClassSchedulePage 一样，仅 in_progress 排课可编辑，其他状态只读
      - completed / archived 自动展开「课评」列
    -->
    <AttendanceRosterDialog
      v-model="rosterDialog"
      :schedule="currentSchedule"
      :read-only="currentScheduleReadOnly"
      :show-evaluation-column="currentScheduleShowEvaluation"
      @saved="onRosterSaved"
    >
      <!-- 2026-06-26: 把"准备上课/开始上课/结束/归档"四个生命周期按钮放进抽屉 header。
           列表视图本身在卡片上已经有按钮，这里通过 slot 注入只为日历视图服务；
           列表视图不传 slot，CSS :has() 自动让出右侧空间。 -->
      <template #header-actions>
        <!--
          2026-06-26: 4 个按钮全部跟 CI 是否 active 联动:
            - CI 非 active → 按钮 disabled, 鼠标悬浮显示 tooltip 解释"开班还没进行中, 不能操作"
            - CI active → 正常可点 (archive 还要再叠加 archiveEnabled 判断)
          Element Plus 的 <el-tooltip> 包裹 disabled 的 <el-button> 时, 必须用一层 <span>
            包住 button (disabled 元素不会触发 mouseenter, 套 span 才能让 tooltip 浮起来)。
          跟 ClassSchedulePage 列表卡片同语义: 后端 assertCourseInstanceActive 会挡,
            这里提前 disabled + tooltip 让用户不用等到点了才发现失败。
        -->
        <!-- scheduled → preparing (准备上课) 蓝(primary)，与"开始上课"区分 -->
        <el-tooltip
          v-if="currentSchedule && currentSchedule.status === 'scheduled'"
          :content="ciBlockTooltip"
          :disabled="ciActiveForAction"
          placement="top"
        >
          <span>
            <el-button
              type="primary" size="small"
              :loading="actionLoading[currentSchedule._id]"
              :disabled="!ciActiveForAction"
              @click="onPrepare"
            >准备上课</el-button>
          </span>
        </el-tooltip>
        <!-- preparing → in_progress (开始上课) 橙(warning)，与「准备上课」区分 -->
        <el-tooltip
          v-if="currentSchedule && currentSchedule.status === 'preparing'"
          :content="ciBlockTooltip"
          :disabled="ciActiveForAction"
          placement="top"
        >
          <span>
            <el-button
              type="warning" size="small"
              :loading="actionLoading[currentSchedule._id]"
              :disabled="!ciActiveForAction"
              @click="onStart"
            >开始上课</el-button>
          </span>
        </el-tooltip>
        <!-- in_progress → completed (结束) 绿(success) -->
        <el-tooltip
          v-if="currentSchedule && currentSchedule.status === 'in_progress'"
          :content="ciBlockTooltip"
          :disabled="ciActiveForAction"
          placement="top"
        >
          <span>
            <el-button
              type="success" size="small"
              :loading="actionLoading[currentSchedule._id]"
              :disabled="!ciActiveForAction"
              @click="openFinishDialog"
            >结束</el-button>
          </span>
        </el-tooltip>
        <!-- completed → archived (归档) 红(danger)；归档额外受 archiveEnabled 控制 -->
        <el-tooltip
          v-if="currentSchedule && currentSchedule.status === 'completed'"
          :content="archiveTooltipText"
          :disabled="archiveEnabled"
          placement="top"
        >
          <span>
            <el-button
              type="danger" size="small"
              :loading="actionLoading[currentSchedule._id]"
              :disabled="!archiveEnabled"
              @click="onArchive"
            >归档</el-button>
          </span>
        </el-tooltip>
        <!--
          2026-06-26: 「补齐名单」按钮 (从原 ClassSchedulePage 搬过来)
            修 prepare 之后又报名/购课/赠课的学生考勤漏生成的 bug。
            显隐: 状态 ∈ {preparing, in_progress, completed, archived} 且 syncToCreate > 0
            数字徽标: 让教务一眼看出"还差几个"
            位置: 在 4 个生命周期按钮之后 (归档之后), 视觉上属于"维护类"操作, 不抢主流程按钮的位置
        -->
        <el-tooltip
          v-if="currentSchedule && ['preparing','in_progress','completed','archived'].includes(currentSchedule.status) && (syncToCreate[currentSchedule._id] ?? 0) > 0"
          content="为该排课补建尚未生成考勤的已报名学生"
          placement="top"
        >
          <span>
            <el-button
              size="small"
              :loading="syncLoading[currentSchedule._id]"
              @click="onSyncAttendances"
            >补齐名单（{{ syncToCreate[currentSchedule._id] }}）</el-button>
          </span>
        </el-tooltip>
      </template>
      <!--
        2026-06-26: 注入 #row-extra — 让已结束/已归档排课的学生行能展开课评编辑器。
        关键：read-only 跟 dialog 的 read-only 分开判断：
          - dialog 的 read-only (status !== 'in_progress') 控制"考勤本次登记 radio"（已结束不能再改是否到课）
          - EvaluationEditor 的 read-only 仅当 status === 'archived'（归档后课评也锁死）
        跟 ClassSchedulePage 的 slot 完全对齐 (line 225-233)。
      -->
      <template #row-extra="{ row: attRow }">
        <EvaluationEditor
          v-if="attRow.status === 'completed' || attRow.status === 'madeup'"
          :attendance="attRow"
          :read-only="currentSchedule?.status === 'archived'"
        />
        <span v-else class="muted">—</span>
      </template>
    </AttendanceRosterDialog>

    <!--
      结束上课弹框：教务填实际下课时间。日历 drawer 复用，跟 ClassSchedulePage 同套交互：
      - 默认填计划结束时间，可改
      - 实际时间与计划相差 ≥5 分钟时强制要求填写理由
      - 成功后 drawer 内的 status tag 自动刷新（事件本身也 reload 一次）
    -->
    <el-dialog v-model="finishDialog" title="结束上课" width="480px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="计划时间">
          <span class="muted">
            {{ currentSchedule ? `${formatDate(currentSchedule.plannedStartTime, 'YYYY-MM-DD HH:mm')} ~ ${formatDate(currentSchedule.plannedEndTime, 'HH:mm')}` : '' }}
          </span>
        </el-form-item>
        <el-form-item label="实际下课时间" required>
          <el-date-picker
            v-model="finishForm.actualEndTime"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            format="YYYY-MM-DD HH:mm"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="差异理由" :required="finishNeedsReason">
          <el-input
            v-model="finishForm.actualEndReason"
            type="textarea" :rows="2" maxlength="500" show-word-limit
            :placeholder="finishNeedsReason ? '实际时间与计划相差 ≥5 分钟，请填写理由' : '可选'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="finishDialog = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading[currentSchedule?._id]" @click="submitFinish">确定结束</el-button>
      </template>
    </el-dialog>

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
import { ref, reactive, computed, onMounted, watch, nextTick } from 'vue'
// 2026-06-26: 用 useRoute 读 ?open=<scheduleId> query, 实现 AttendanceListPage "跳转排课" deep link
import { useRoute, useRouter } from 'vue-router'
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
// 2026-06-26: 日历点事件不再走 el-descriptions 简介抽屉，改成跟「上课表」一致的考勤登记抽屉
import AttendanceRosterDialog from './AttendanceRosterDialog.vue'
// 课评编辑器 — 已结束/已归档排课需要老师写课评，所以必须注入 #row-extra slot
import EvaluationEditor from './EvaluationEditor.vue'

const STATUS_OPTIONS = [
  { value: 'scheduled', label: '已排课' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已完成' },
  { value: 'archived', label: '已归档' },
  { value: 'cancelled', label: '已取消' }
]
const STATUS_LABELS = {
  scheduled: '已排课', in_progress: '进行中', completed: '已完成', archived: '已归档', cancelled: '已取消'
}
// el-tag 的 type 校验只接受 primary/success/info/warning/danger，
// cancelled 是破坏性状态用 danger；fallback 也用 info。
const STATUS_TYPES = {
  scheduled: 'info', in_progress: 'warning', completed: 'success', archived: 'info', cancelled: 'danger'
}
// 2026-06-26: 开班状态中文映射。非 active 开班的事件统一用中性灰底，CI 状态改由 title 前缀表达，
//   避免小日历块上"饱和色 vs 同色系淡色"两种语义的视觉撕裂。
const CI_STATUS_LABELS = {
  planning: '筹备中', enrolling: '招生中', active: '进行中', closed: '已结班', cancelled: '已取消'
}

function statusLabel(s) { return STATUS_LABELS[s] || s || '—' }
function statusType(s) { return STATUS_TYPES[s] || 'info' }
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
// 2026-06-26: 状态改成 statuses 数组 (UI 多选下拉) — 单选 status 已弃用
//   default: 跟原 ClassSchedulePage 一致, 默认 4 个"未结"的 status, 不显示已结束/已归档/已取消 (这些单独手动加)
const filters = reactive({
  courseInstance: '',
  teacher: '',
  room: '',
  statuses: ['scheduled', 'preparing', 'in_progress', 'completed'],
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
  filters.statuses = ['scheduled', 'preparing', 'in_progress', 'completed']
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

// ─── 抽屉详情（考勤登记，2026-06-26: 由 el-descriptions 简介抽屉改为 AttendanceRosterDialog） ────
// 日历事件 shape（eventMap 里）跟列表接口的 row shape 不一样：
//   event:    { id, lessonNo, start, end, status, teacher, room, courseInstance:{id,name,status}, isTrialLesson }
//   list row: { _id,  lessonNo, plannedStartTime, plannedEndTime, status, teacher, room, courseInstance:{...} }
// 这里转一份 schedule 给 AttendanceRosterTable 用。
const rosterDialog = ref(false)
const currentSchedule = ref(null)
// 只读规则跟 ClassSchedulePage 对齐：仅 in_progress 可改考勤，其他状态只读
const currentScheduleReadOnly = computed(() => {
  if (!currentSchedule.value) return false
  return currentSchedule.value.status !== 'in_progress'
})
// 仅 completed / archived 才显示「课评」列
const currentScheduleShowEvaluation = computed(() => {
  if (!currentSchedule.value) return false
  const s = currentSchedule.value.status
  return s === 'completed' || s === 'archived'
})

function openDrawer(id) {
  const ev = eventMap.get(id)
  if (!ev) return
  // 2026-06-26: teacher/room 已是 object (来自后端 calendar endpoint 新 populate)，
  //   courseInstance 同理；只需把日历的 { id, start, end, isTrialLesson } 拍平到 detail 接口的 shape。
  currentSchedule.value = {
    _id: ev.id,
    lessonNo: ev.lessonNo,
    status: ev.status,
    isTrialLesson: ev.isTrialLesson,
    plannedStartTime: ev.start,
    plannedEndTime: ev.end,
    teacher: ev.teacher,
    room: ev.room,
    courseInstance: ev.courseInstance
  }
  rosterDialog.value = true
  // 2026-06-26: 打开抽屉后立即拉一次 sync preview, 决定「补齐名单」按钮要不要出现
  refreshSyncPreview()
}

function onRosterSaved() {
  // 考勤保存后，刷新该事件的就近状态（典型场景：scheduled → preparing 后端没有直接改 schedule 状态，
  //   但 in_progress / completed 状态会被 finish 接口改；这里保守地 reload 一次日历事件）
  reload()
}

// ─── 排课生命周期操作（与 ClassSchedulePage 同语义） ────────────────
// 2026-06-26: 这 4 个按钮注入到 AttendanceRosterDialog 的 #header-actions slot，
//   让日历抽屉也能直接切排课状态，而不必跳回列表页。色板/含义跟列表卡片完全一致。
// 后端 assertCourseInstanceActive 会挡掉非 active 开班，这里失败统一 toast 提示。
const actionLoading = reactive({})
async function withAction(id, fn) {
  actionLoading[id] = true
  try { return await fn() }
  finally { actionLoading[id] = false }
}

async function onPrepare() {
  const s = currentSchedule.value
  if (!s) return
  await withAction(s._id, async () => {
    try {
      await lessonScheduleApi.prepare(s._id)
      ElMessage.success('已进入准备中状态')
      // drawer 内的状态 tag 跟日历块本身都要刷新（status 已变）
      await refreshCurrentScheduleStatus()
      await reload()
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || '准备上课失败')
    }
  })
}

async function onStart() {
  const s = currentSchedule.value
  if (!s) return
  await withAction(s._id, async () => {
    try {
      await lessonScheduleApi.start(s._id)
      ElMessage.success('已开始上课')
      await refreshCurrentScheduleStatus()
      await reload()
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || '开始上课失败')
    }
  })
}

// 结束上课弹框
const finishDialog = ref(false)
const finishForm = reactive({ actualEndTime: '', actualEndReason: '' })
const finishNeedsReason = computed(() => {
  const s = currentSchedule.value
  if (!s || !finishForm.actualEndTime) return false
  const plan = s.plannedEndTime ? new Date(s.plannedEndTime).getTime() : null
  if (!plan) return false
  const act = new Date(finishForm.actualEndTime).getTime()
  if (Number.isNaN(act)) return false
  return Math.abs(act - plan) >= 5 * 60 * 1000
})
function openFinishDialog() {
  const s = currentSchedule.value
  if (!s) return
  finishForm.actualEndTime = s.plannedEndTime
    ? formatDate(s.plannedEndTime, 'YYYY-MM-DD HH:mm:ss')
    : formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
  finishForm.actualEndReason = ''
  finishDialog.value = true
}
async function submitFinish() {
  const s = currentSchedule.value
  if (!s) return
  if (!finishForm.actualEndTime) return ElMessage.warning('请填写实际下课时间')
  if (finishNeedsReason.value && !finishForm.actualEndReason) {
    return ElMessage.warning('实际时间与计划相差 ≥5 分钟，请填写理由')
  }
  await withAction(s._id, async () => {
    try {
      await lessonScheduleApi.finish(s._id, {
        actualEndTime: finishForm.actualEndTime,
        actualEndReason: finishForm.actualEndReason || undefined
      })
      ElMessage.success('已结束上课')
      finishDialog.value = false
      await refreshCurrentScheduleStatus()
      await reload()
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || '结束上课失败')
    }
  })
}

// 2026-06-26: CI 状态联动 —— 4 个生命周期按钮在 CI 非 active 时统一 disabled + tooltip 解释。
//   复用 ClassSchedulePage / AttendanceRosterTable 里的 CI_STATUS_LABELS 中文映射。
const ciActiveForAction = computed(() => {
  const ci = currentSchedule.value && currentSchedule.value.courseInstance
  // 老数据/缺字段一律按"未知"处理：保持可点, 让后端去兜底拒绝。
  if (!ci || !ci.status) return true
  return ci.status === 'active'
})
const ciBlockTooltip = computed(() => {
  const ci = currentSchedule.value && currentSchedule.value.courseInstance
  if (!ci) return '开班信息缺失，无法操作'
  const labelMap = { planning: '筹备中', enrolling: '招生中', closed: '已结班', cancelled: '已取消' }
  const label = labelMap[ci.status] || ci.status
  return `开班「${ci.name || ''}」当前为「${label}」，请先将开班切到「进行中」再操作`
})
// 归档：仅当所有"已消课/已补"考勤都写了课评才能归档。日历视图里没有完整名单上下文（roster 是 drawer 内异步拉的），
//   简化处理：只要 status === completed 就允许点击，让后端 assertArchiveRequirements 做精确校验；后端会返回 422 + 详情。
const archiveEnabled = computed(() => {
  if (!currentSchedule.value || currentSchedule.value.status !== 'completed') return false
  // CI 非 active 时也归为不可归档（archive 也要走 assertCourseInstanceActive）
  return ciActiveForAction.value
})
const archiveTooltipText = computed(() => {
  if (!archiveEnabled.value && currentSchedule.value && currentSchedule.value.status === 'completed' && !ciActiveForAction.value) {
    return ciBlockTooltip.value
  }
  return '归档（后端会校验所有已消课考勤是否都写了课评）'
})
async function onArchive() {
  const s = currentSchedule.value
  if (!s) return
  try {
    await ElMessageBox.confirm('归档后状态将变为"已归档"，是否继续？', '归档确认', { type: 'success' })
  } catch { return }
  await withAction(s._id, async () => {
    try {
      await lessonScheduleApi.archive(s._id)
      ElMessage.success('已归档')
      await refreshCurrentScheduleStatus()
      await reload()
    } catch (e) {
      const msg = e?.response?.data?.message || '归档失败'
      const missing = e?.response?.data?.details?.missingAttendanceIds
      if (missing && missing.length) {
        ElMessage.error(`${msg}（缺失 ${missing.length} 条）`)
      } else {
        ElMessage.error(msg)
      }
    }
  })
}

/**
 * 生命周期操作完成后，刷新 drawer 顶部的 status tag。
 * 重新调 detail 接口拿最新 schedule（包括 status），写回 currentSchedule。
 * calendar 视图的事件块刷新由 reload() 负责。
 */
async function refreshCurrentScheduleStatus() {
  const s = currentSchedule.value
  if (!s) return
  try {
    const r = await lessonScheduleApi.detail(s._id)
    const fresh = r.data
    if (fresh) {
      // 仅保留 drawer 用到的字段，避免 detail 返回的 resolvedContent 等大字段污染 currentSchedule
      currentSchedule.value = {
        _id: fresh._id,
        lessonNo: fresh.lessonNo,
        status: fresh.status,
        isTrialLesson: fresh.isTrialLesson,
        plannedStartTime: fresh.plannedStartTime,
        plannedEndTime: fresh.plannedEndTime,
        actualStartTime: fresh.actualStartTime,
        actualEndTime: fresh.actualEndTime,
        teacher: fresh.teacher,
        room: fresh.room,
        courseInstance: fresh.courseInstance
      }
    }
  } catch (e) {
    // 拉取失败不阻塞主流程，UI 会保留旧 status
    console.warn('刷新排课详情失败', e)
  }
  // 2026-06-26: 每次详情刷新后重算补齐名单数字, 让 prepare / finish / archive 等操作后徽标实时更新
  await refreshSyncPreview()
}

// 2026-06-26: 「补齐名单」按钮 (从原 ClassSchedulePage 搬过来 — 上课表下线后, 这里是唯一入口)
//   修 prepare 之后又报名/购课/赠课的学生考勤漏生成的 bug; 幂等, 可重复点。
//   按钮只在 preparing/in_progress/completed/archived 状态 且 preview 接口返回 toCreate > 0 时显示,
//   数字徽标让教务一眼看出"还差几个"。
const syncLoading = reactive({})
const syncToCreate = reactive({}) // { [scheduleId]: number }
async function refreshSyncPreview() {
  const s = currentSchedule.value
  if (!s || !s._id) return
  try {
    const r = await lessonScheduleApi.previewSyncAttendances(s._id)
    syncToCreate[s._id] = r.data?.toCreate ?? 0
  } catch {
    syncToCreate[s._id] = 0
  }
}
async function onSyncAttendances() {
  const s = currentSchedule.value
  if (!s) return
  try {
    await ElMessageBox.confirm(
      '将为该排课补建所有「已报名且持有效课包」但尚未生成考勤的学生考勤，是否继续？',
      '补齐名单',
      { type: 'info' }
    )
  } catch { return }
  syncLoading[s._id] = true
  try {
    const r = await lessonScheduleApi.syncAttendances(s._id)
    const created = r.data?.created ?? 0
    ElMessage.success(created > 0 ? `已补齐 ${created} 名学生考勤` : '名单已完整，无需补齐')
    // 1) 刷新 drawer 里的 attendance roster (Calendar 视图 reload 事件也走这里)
    await refreshCurrentScheduleStatus()
    // 2) 重新算 toCreate (补齐后归零, 按钮自动隐式消失)
    await refreshSyncPreview()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '补齐失败')
  } finally {
    syncLoading[s._id] = false
  }
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
    // 2026-06-26: 状态多选 — 后端 calendar 接口已支持逗号分隔多 status (见 lessonSchedule.service.js:1002-1006)
    if (filters.statuses && filters.statuses.length) {
      params.status = filters.statuses.join(',')
    }
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
      // 2026-06-26: 二分视觉。
      //   active CI → 维持现状（status 色饱和底 + 白字 + 同色边，"可上课"语义）。
      //   非 active CI → 全部统一 #f5f7fa 中性浅灰底 + 浅灰边 + 深字。
      //     上一版"同色系淡底"在小块日历上变成一堆相邻的淡蓝/淡橙/淡绿，反而显得零碎；
      //     改成单色后，active vs 非 active 的视觉差异只来自"饱和 vs 中性"一个维度，
      //     CI 状态（招生中/筹备中/已结班/已取消）改由 buildEventTitle 加 title 前缀承载。
      const ciActive = e.courseInstance && e.courseInstance.status === 'active'
      const base = eventColor(e.status, e.isTrialLesson)
      return {
        id: e.id,
        title: buildEventTitle(e),
        start: e.start,
        end: e.end,
        backgroundColor: ciActive ? base : '#f5f7fa',
        borderColor: ciActive ? base : '#dcdfe6',
        textColor: ciActive ? '#fff' : '#303133',
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
  // 2026-06-26: teacher/room 现在是 { realName, mobile } / { name, location } object，
  //   之前是字符串。兼容老数据用可选链 + 或语法，老 event 可能还是 string/null。
  const teacherName = (e.teacher && (e.teacher.realName || e.teacher.mobile)) || (typeof e.teacher === 'string' ? e.teacher : '-')
  const roomName = (e.room && e.room.name) || (typeof e.room === 'string' ? e.room : '-')
  const who = `${teacherName} / ${roomName}`
  // 2026-06-26: 非 active 开班的块底色统一成中性灰，CI status 不再由颜色表达，
  //   改成 title 前缀文字，让用户在统一底色下仍能看出"这张排课属于哪种未就绪的开班"。
  //   active 开班不加前缀（保持原样）。
  const ciStatus = e.courseInstance && e.courseInstance.status
  const ciPrefix = ciStatus && ciStatus !== 'active'
    ? `[${CI_STATUS_LABELS[ciStatus] || ciStatus}] `
    : ''
  return `${e.isTrialLesson ? '[试听] ' : ''}${ciPrefix}${no}${course}\n${who}`
}

function eventColor(status, isTrialLesson) {
  // 招生试听 (2026-06): 试听课统一用浅橙色, 跟"进行中"区分 (进行中是 #e6a23c 橙色)
  if (isTrialLesson) return '#f0a020'   // 橙黄：试听课
  switch (status) {
    case 'completed': return '#67c23a'   // 绿：已完成
    case 'in_progress': return '#e6a23c' // 橙：进行中
    case 'cancelled': return '#909399'   // 灰：已取消
    case 'archived': return '#b1b3b8'    // 浅灰：已归档（比 cancelled 更淡，区分于「取消」的中性冻结态）
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

// 2026-06-26: 上课表下线后, AttendanceListPage "跳转排课" 跳到 /schedule?open=<id> 触发明细抽屉
//   calendar 加载完事件后查 eventMap, 命中就 openDrawer; 一次性, 处理完清空 query 避免刷新重复弹
const route = useRoute()
const router = useRouter()
// 2026-06-26: 跳到排课列表视图 (/schedule/list), 编辑/批量/补齐名单的主战场
function goToScheduleList() {
  router.push('/schedule/list')
}
async function maybeOpenFromQuery() {
  const openId = route.query && route.query.open
  if (!openId) return
  // 等一次 nextTick 让 reload() 把 eventMap 填好
  await nextTick()
  if (eventMap.has(String(openId))) {
    openDrawer(String(openId))
  } else {
    // 当前可视区没这节, 提示用户调日期范围
    ElMessage.warning('该排课不在当前可视区，请调整日期范围后重试')
  }
  // 清掉 query 避免 F5 重复弹
  const { open, ...rest } = route.query
  // 用 replace 避免污染浏览器历史
  // eslint-disable-next-line no-unused-vars
}

onMounted(async () => {
  await loadDeps()
  await nextTick()
  await reload()
  await maybeOpenFromQuery()
})

// 监听筛选条件联动
watch(
  () => [filters.courseInstance, filters.teacher, filters.room, filters.statuses, filters.from, filters.to],
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
.header-actions { display: flex; gap: 8px; flex-shrink: 0; align-items: center; }

/* 2026-06-26: 视图切换 pill (日历视图 / 列表视图).
   active 端禁用 + 黑底白字; inactive 端 hover 浅灰; pill 整体圆角, 中间无缝拼接. */
.view-toggle {
  display: inline-flex;
  background: #f4f4f5;
  border-radius: 999px;
  padding: 3px;
  gap: 0;
}
.view-toggle__btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: #606266;
  font-size: 13px;
  padding: 6px 16px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
  line-height: 1.2;
}
.view-toggle__btn:hover:not(:disabled):not(.is-active) {
  background: #fff;
  color: #303133;
}
.view-toggle__btn.is-active,
.view-toggle__btn:disabled {
  background: #303133;
  color: #fff;
  font-weight: 500;
  cursor: default;
}
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
