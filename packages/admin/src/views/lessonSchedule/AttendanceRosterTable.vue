<template>
  <div v-loading="loading" class="roster-body">
    <!-- 头部摘要 -->
    <div class="summary">
      <div class="summary-row">
        <span class="label">开班：</span>
        <span class="value">{{ courseInstanceName }}</span>
        <!-- 2026-06-26: 开班状态 tag 总是显示（之前只在非 active 时显示，active 时缺席），让用户一眼知道开班生命周期。
             type 区分：active=绿(success), 筹备/招生/已结班=灰(info), 已取消=红(danger)。 -->
        <el-tag
          v-if="courseInstanceStatus"
          size="small"
          effect="plain"
          :type="courseInstanceStatusType"
          style="margin-left: 8px"
        >{{ courseInstanceStatusLabel }}</el-tag>
      </div>
      <!-- 2026-06-26: 开班上下文（周期 / 排课 / 上限 / 试听）保留为 muted 紧凑排版 -->
      <div class="summary-row ci-meta-row">
        <span>{{ courseInstancePeriod }}</span>
        <span class="ci-meta-sep">·</span>
        <span>{{ courseInstanceSchedule }}</span>
        <template v-if="courseInstanceMaxStudents !== '—'">
          <span class="ci-meta-sep">·</span>
          <span>上限 {{ courseInstanceMaxStudents }} 人</span>
        </template>
        <template v-if="courseInstanceIsTrial">
          <span class="ci-meta-sep">·</span>
          <el-tag size="small" effect="plain" type="warning">试听</el-tag>
        </template>
      </div>
      <div class="summary-row">
        <span class="label">课次：</span>
        <!-- 2026-06-26: 总课时直接拼到「第 N / M 课」里，跟课时做"位置"对比，比单独一行 muted 共 X 课显眼得多。
             当 CI 没回 syllabus / schedulePlan 总课时时，fallback 到普通「第 N 课」。 -->
        <span class="value">
          第 {{ lessonNo }}<template v-if="courseInstanceLessonCount !== '—'"> / {{ courseInstanceLessonCount }}</template> 课
        </span>
        <span class="label" style="margin-left: 24px">时间：</span>
        <span class="value">{{ formatDate(plannedStartTime, 'YYYY-MM-DD HH:mm') }} - {{ formatDate(plannedEndTime, 'HH:mm') }}</span>
      </div>
      <div class="summary-row">
        <span class="label">老师：</span>
        <span class="value">{{ teacherName }}</span>
        <span class="label" style="margin-left: 24px">教室：</span>
        <span class="value">{{ roomName }}</span>
      </div>
      <!-- 2026-06-26: 加「状态」行, 跟老师/教室同一档, 让排课当前生命周期阶段（已排课/准备中/进行中/已结束/已归档/已取消）一眼可见。
           同时通过 el-tag 的 type 让色彩辅助判读（已结束=绿，进行中=橙，已取消=红）。
           状态行右侧用 #header-actions slot 承载"准备上课/开始上课/结束/归档"等生命周期操作。
           默认空（列表视图本身卡片上已有按钮, 抽屉里再放一次会冗余），日历视图通过 slot 注入。
           注意：开班 (CI) 状态已在「开班」行以 tag 形式一直展示，这里不再重复。 -->
      <div class="summary-row summary-row--with-actions">
        <span class="label">状态：</span>
        <span class="value">
          <el-tag :type="scheduleStatusType" size="small" effect="dark">{{ scheduleStatusLabel }}</el-tag>
        </span>
        <!-- 2026-06-26: 父组件（ScheduleCalendar）通过这个 slot 注入生命周期按钮。
             slot 留空时这一格完全消失，不影响列表视图既有布局。 -->
        <span class="summary-actions">
          <slot name="header-actions" />
        </span>
      </div>
    </div>

    <!--
      2026-06-26: roster 空时, 把"本开班下已报名学生"列出来 (按 user 要求)。
        - 优先用 CourseEnrollment.studentProduct.remainingLessons 作为「剩余课时」徽标
        - 失效/过期课包 (isActive=false 或 expireDate<now) 用灰色 + 文案提示
        - 无 studentProduct 的报名行 (例如新生还没绑课) 单独标"未绑课"
        - 完全没人报名时, 退回原来"可能原因"提示
    -->
    <template v-if="rosterItems.length === 0 && !loading">
      <el-alert
        v-if="enrolledLoading"
        type="info"
        :closable="false"
        show-icon
        style="margin: 12px 0"
      >
        <template #title>正在加载预报名单…</template>
      </el-alert>
      <template v-else-if="enrolledStudents.length > 0">
        <div class="enrolled-section">
          <div class="enrolled-header">
            <span class="enrolled-title">本开班下已报名学生（暂未生成考勤）</span>
            <span class="enrolled-sub muted">共 {{ enrolledStudents.length }} 人 · 准备上课时会按 FIFO 自动生成考勤</span>
          </div>
          <el-table :data="enrolledStudents" border size="small" max-height="320">
            <el-table-column label="学生" prop="name" min-width="120" />
            <el-table-column label="剩余课时" width="120" align="center">
              <template #default="{ row }">
                <el-tag
                  v-if="row.studentProduct && row.studentProduct.remainingLessons > 0 && productUsable(row.studentProduct)"
                  type="success" effect="plain" size="small"
                >剩 {{ row.studentProduct.remainingLessons }} 节</el-tag>
                <el-tag
                  v-else-if="row.studentProduct && row.studentProduct.remainingLessons > 0"
                  type="info" effect="plain" size="small"
                >剩 {{ row.studentProduct.remainingLessons }} 节 · 已过期</el-tag>
                <el-tag
                  v-else-if="row.studentProduct"
                  type="info" effect="plain" size="small"
                >已耗尽</el-tag>
                <el-tag
                  v-else
                  type="warning" effect="plain" size="small"
                >未绑课</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="总课时" width="90" align="center">
              <template #default="{ row }">
                <span v-if="row.studentProduct">{{ row.studentProduct.totalLessons || '—' }}</span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
            <el-table-column label="课包来源" min-width="140">
              <template #default="{ row }">
                <span v-if="!row.studentProduct" class="muted">—</span>
                <span v-else-if="row.studentProduct.source === 'gift'">
                  赠课<span v-if="row.studentProduct.giftReason"> · {{ row.studentProduct.giftReason }}</span>
                </span>
                <span v-else-if="row.studentProduct.source === 'order'">购课</span>
                <span v-else class="muted">{{ row.studentProduct.source || '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="到期" width="120" align="center">
              <template #default="{ row }">
                <span v-if="row.studentProduct && row.studentProduct.expireDate" class="muted">
                  {{ formatDate(row.studentProduct.expireDate, 'YYYY-MM-DD') }}
                </span>
                <span v-else class="muted">—</span>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </template>
      <el-alert
        v-else
        type="info"
        :closable="false"
        show-icon
        style="margin: 12px 0"
      >
        <template #title>本节课暂无学生考勤名单</template>
        <div class="muted" style="margin-top: 4px">可能原因：本开班下没有已报名的学生，或所有报名学生都没有可用课包</div>
      </el-alert>
    </template>

    <!-- 名单操作说明已收敛到行内的"本次登记 / 已消课"标签, 取消横幅 (2026-06-26)
      名单表 (2026-06-23 改造: 课评 / 补课 折叠到可展开行内, 避免横向滚动)
        - 行内仅显示: 学生/课包/状态/本次登记/备注 (5 列)
        - 行尾加 type="expand" 展开列, 点了下边展开行: 课评 (左) + 补课按钮 (右)
        - 已消课/已补的学生也支持展开, 用于查看/补写课评
        - 不再有横向滚动, 抽屉宽度可缩到合理范围
    -->
    <el-table v-if="rosterItems.length" :data="rosterItems" border size="small" max-height="540">
      <!-- 展开列: 仅当排课需要课评或可补课时显示 (避免无意义箭头) -->
      <el-table-column v-if="canExpand" type="expand" width="44">
        <template #default="{ row }">
          <!--
            展开区: 左右两栏
              左 (flex: 1): EvaluationEditor (通过 #row-extra 插槽注入)
              右 (固定宽度): 状态标记 + 补课按钮 (通过 #row-makeup 插槽注入)
            两者至少有一个, 父组件控制内容. 若都无内容, 整区显示 "—".
          -->
          <div class="row-expansion">
            <div class="row-expansion-main">
              <slot
                v-if="showEvaluationColumn"
                name="row-extra"
                :row="row"
              />
              <span v-else class="muted">（无课评）</span>
            </div>
            <div class="row-expansion-side">
              <slot
                v-if="canMakeupColumn && !isConsumedRow(row)"
                name="row-makeup"
                :row="row"
              />
              <el-tag
                v-else-if="row.status === 'madeup'"
                size="small"
                type="warning"
                effect="plain"
              >已补</el-tag>
              <el-tag
                v-else-if="isConsumedRow(row)"
                size="small"
                type="success"
                effect="plain"
              >已消课</el-tag>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="学生" min-width="110">
        <template #default="{ row }">
          <span v-if="row.student">{{ row.student.name }}</span>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column label="课包" min-width="130">
        <template #default="{ row }">
          <template v-if="row.studentProduct">
            <el-tag size="small" effect="plain">剩 {{ row.studentProduct.remainingLessons }} 节</el-tag>
            <div class="muted" style="margin-top: 2px">至 {{ formatDate(row.studentProduct.expireDate, 'YYYY-MM-DD') }}</div>
          </template>
          <template v-else>
            <el-tag size="small" type="danger" effect="plain">无课包</el-tag>
          </template>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="90">
        <template #default="{ row }">
          <el-tag :type="originalStatusType(row.status)" size="small" effect="plain">{{ originalStatusLabel(row.status) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="本次登记" min-width="220">
        <template #default="{ row }">
          <el-radio-group
            v-model="row._status"
            :disabled="readOnly || isConsumedRow(row)"
            size="small"
          >
            <el-radio-button value="present">正常</el-radio-button>
            <el-radio-button value="late">迟到</el-radio-button>
            <el-radio-button value="leave">请假</el-radio-button>
            <el-radio-button value="no_show">未到</el-radio-button>
          </el-radio-group>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="140">
        <template #default="{ row }">
          <el-input
            v-model="row._remark"
            size="small"
            :disabled="readOnly || isConsumedRow(row)"
            maxlength="200"
            show-word-limit
            placeholder="可选"
          />
        </template>
      </el-table-column>
    </el-table>

    <!-- 底部批量操作 -->
    <div v-if="rosterItems.length && !readOnly" class="bulk-actions">
      <el-button size="small" @click="setAll('present')">全部正常</el-button>
      <el-button size="small" @click="setAll('late')">全部迟到</el-button>
      <el-button size="small" @click="setAll('leave')">全部请假</el-button>
      <el-button size="small" @click="setAll('no_show')">全部未到</el-button>
      <span class="muted">已选：{{ summary.counts.present }} 正常 / {{ summary.counts.late }} 迟到 / {{ summary.counts.leave }} 请假 / {{ summary.counts.no_show }} 未到</span>
      <span class="spacer" />
      <!-- 关键：未保存变更提示 + 保存按钮。
           之前漏了这个按钮，导致用户在 radio 上选「请假/未到」后只改了本地 _status，
           从未调 bulkMark；点「结束」时后端仍把考勤当 checked_in，错误扣课时。 -->
      <el-tag v-if="dirtyCount > 0" type="warning" size="small" effect="dark">未保存 {{ dirtyCount }} 处变更</el-tag>
      <el-button
        size="small"
        type="primary"
        :loading="submitting"
        :disabled="dirtyCount === 0"
        @click="onSubmit"
      >保存考勤</el-button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
// 2026-06-26: roster 空时拉 CourseEnrollment 列预报名单, 让准备上课前就能看到"谁报了这门课 + 剩多少节"
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { formatDate } from '@/utils/format'

const props = defineProps({
  // 当前排课（用于定位 attendance 列表 + 头部摘要）
  schedule: { type: Object, required: true },
  // 只读模式：状态非进行中或排课已归档/已取消时为 true
  readOnly: { type: Boolean, default: false },
  // 暴露给父组件的 roster ref（在抽屉里无意义，新页面用它来获取已加载名单）
  exposeRoster: { type: Boolean, default: false },
  // 2026-06-23: 是否在行尾追加「课评」列. 由父组件按排课状态 (completed/archived) 控制.
  //   课评列内容由父组件通过 #row-extra 插槽注入 (EvaluationEditor);
  //   旧版本用 <slot name="row-extra"> 直接写在 el-table 子节点里, 会触发 Vue 警告
  //   "Property 'row' was accessed during render but is not defined on instance",
  //   所以改成包在 el-table-column 里 (row 通过 #default="{ row }" 解构出来) + 由 prop 控制显隐.
  showEvaluationColumn: { type: Boolean, default: false }
})
const emit = defineEmits(['loaded', 'saved'])

// UI 状态 → 后端 AttendanceStatus
const UI_TO_BACKEND = {
  present: 'checked_in',  // 正常
  late: 'checked_in',     // 迟到（仍是 checked_in，靠备注 + actualStartTime 体现）
  leave: 'leave',         // 请假
  no_show: 'no_show'      // 未到
}
const BACKEND_ORIGINAL_LABELS = {
  scheduled: '待上课',
  checked_in: '已签到',
  completed: '已消课',
  madeup: '已补',
  no_show: '未到',
  leave: '请假'
}
// el-tag 的 type 校验只接受 primary/success/info/warning/danger，leave 改 info。
const BACKEND_ORIGINAL_TYPES = {
  scheduled: 'info',
  checked_in: 'warning',
  completed: 'success',
  madeup: 'warning',
  no_show: 'danger',
  leave: 'info'
}

/**
 * 是否已扣课时（不再允许修改考勤状态 / 备注 / 补课）。
 * 等价于 status ∈ ['completed', 'madeup']；抽出 helper 是为了和"是否要显示 makeup 按钮"等
 * 业务判断保持一致——后续如果增加"消课撤回"，只需调整这一处。
 */
function isConsumed(s) {
  return s === 'completed' || s === 'madeup'
}

const loading = ref(false)
const submitting = ref(false)
// [{ id, student, studentProduct, status, evaluation, _status, _remark }]
const rosterItems = ref([])

const courseInstanceName = computed(() => {
  const ci = props.schedule.courseInstance
  if (!ci) return '—'
  return ci.name || (ci.courseProduct && ci.courseProduct.name) || '—'
})
const lessonNo = computed(() => props.schedule?.lessonNo || '?')
const plannedStartTime = computed(() => props.schedule?.plannedStartTime)
const plannedEndTime = computed(() => props.schedule?.plannedEndTime)
const teacherName = computed(() => {
  const t = props.schedule?.teacher
  return t ? (t.realName || t.mobile) : '—'
})
const roomName = computed(() => {
  const r = props.schedule?.room
  return r ? r.name : '—'
})
// 2026-06-26: 排课状态 + 开班状态的中文 + el-tag type，跟 ClassSchedulePage / ScheduleCalendar 对齐
const SCHEDULE_STATUS_LABELS = {
  scheduled: '已排课', preparing: '准备中', in_progress: '进行中',
  completed: '已结束', archived: '已归档', cancelled: '已取消'
}
const SCHEDULE_STATUS_TYPES = {
  scheduled: 'info', preparing: 'primary', in_progress: 'warning',
  completed: 'success', archived: 'info', cancelled: 'danger'
}
const CI_STATUS_LABELS = {
  planning: '筹备中', enrolling: '招生中', active: '进行中', closed: '已结班', cancelled: '已取消'
}
const scheduleStatusLabel = computed(() => {
  const s = props.schedule && props.schedule.status
  return SCHEDULE_STATUS_LABELS[s] || s || '—'
})
const scheduleStatusType = computed(() => {
  const s = props.schedule && props.schedule.status
  return SCHEDULE_STATUS_TYPES[s] || 'info'
})
const courseInstanceStatus = computed(() => {
  const ci = props.schedule && props.schedule.courseInstance
  return ci && ci.status
})
const courseInstanceStatusLabel = computed(() => {
  const s = courseInstanceStatus.value
  return s ? `开班${CI_STATUS_LABELS[s] || s}` : ''
})
// 2026-06-26: CI 状态 tag 的 el-tag type——active 用 success 跟开班行背景区分（开班 active = "正常/健康"），
//   cancelled 用 danger（破坏性），其他筹备/招生/已结班 用 info（中性）。
//   跟 ScheduleCalendar 事件块的底色逻辑保持视觉一致。
const CI_STATUS_TYPES = {
  planning: 'info',
  enrolling: 'info',
  active: 'success',
  closed: 'info',
  cancelled: 'danger'
}
const courseInstanceStatusType = computed(() => {
  const s = courseInstanceStatus.value
  return CI_STATUS_TYPES[s] || 'info'
})
// 2026-06-26: 开班上下文字段（周期 / 排课计划 / 总课时 / 招生上限），由日历 calendar 接口带回的
//   startDate / estimatedEndDate / schedulePlan / syllabusSnapshot / maxStudents 派生。
const courseInstancePeriod = computed(() => {
  const ci = props.schedule && props.schedule.courseInstance
  if (!ci || !ci.startDate) return '—'
  const start = formatDate(ci.startDate, 'YYYY-MM-DD')
  const end = ci.estimatedEndDate ? formatDate(ci.estimatedEndDate, 'YYYY-MM-DD') : '?'
  return `${start} ~ ${end}`
})
const courseInstanceSchedule = computed(() => {
  const ci = props.schedule && props.schedule.courseInstance
  if (!ci || !ci.schedulePlan) return '—'
  const sp = ci.schedulePlan
  const parts = []
  if (sp.mode === 'weekly' && sp.lessonsPerWeek) {
    parts.push(`每周 ${sp.lessonsPerWeek} 节`)
  } else if (sp.mode === 'cycle' && sp.cycleOnDays) {
    parts.push(`每 ${sp.cycleOnDays} 天循环`)
  }
  if (sp.minutesPerLesson) parts.push(`每节 ${sp.minutesPerLesson} 分钟`)
  return parts.length ? parts.join(' · ') : '—'
})
const courseInstanceLessonCount = computed(() => {
  const ci = props.schedule && props.schedule.courseInstance
  if (!ci) return '—'
  const total = (ci.syllabusSnapshot && ci.syllabusSnapshot.totalLessons)
    || (ci.syllabusOverride && ci.syllabusOverride.totalLessons)
    || (ci.schedulePlan && ci.schedulePlan.totalPlannedLessons)
    || 0
  return total > 0 ? total : '—'
})
const courseInstanceMaxStudents = computed(() => {
  const ci = props.schedule && props.schedule.courseInstance
  if (!ci || !ci.maxStudents) return '—'
  return ci.maxStudents
})
const courseInstanceIsTrial = computed(() => {
  const ci = props.schedule && props.schedule.courseInstance
  return !!(ci && ci.isTrial)
})
// 2026-06-26: 判断一个 StudentProduct 是否还能用于生成考勤 / 消课 (用于预报名单的"剩余课时"徽标颜色)
//   isActive=false 或 expireDate 已过 → 失效
//   isActive 字段没返回时默认 true (后端 list 已 populate, 多数情况都有)
function productUsable(sp) {
  if (!sp) return false
  if (sp.isActive === false) return false
  if (sp.expireDate && new Date(sp.expireDate).getTime() < Date.now()) return false
  return true
}

/**
 * 「补课」操作列是否显示：仅当排课处于「已结束/已归档」时显示。
 * 其他状态（preparing / in_progress）不允许补课，无操作列。
 */
const canMakeupColumn = computed(() => {
 const s = props.schedule && props.schedule.status
 return s === 'completed' || s === 'archived'
})

/**
 * 2026-06-23: 整张表是否需要展开列 (type="expand").
 *   - 仅当排课已结束/已归档 才允许展开 (写课评 / 补课)
 *   - 状态 preparing/in_progress 时不显示箭头, 行内 5 列已足够
 *   - 当父组件没传 showEvaluationColumn 也不需要展开 (无课评无补课场景)
 */
const canExpand = computed(() => canMakeupColumn.value)

const summary = computed(() => {
  const counts = { present: 0, late: 0, leave: 0, no_show: 0 }
  for (const it of rosterItems.value) {
    if (counts[it._status] !== undefined) counts[it._status]++
  }
  return { counts }
})

/**
 * 统计「dirty」变更数量：状态或备注相对后端值有变化。
 * 用于：1) 显示「未保存 N 处」标签；2) 保存按钮 disabled 状态；3) 父组件判断「结束前是否需要先 flush」。
 */
const dirtyCount = computed(() => {
  let n = 0
  for (const it of rosterItems.value) {
    if (isConsumed(it.status)) continue // 已消课/已补 不可改
    const target = UI_TO_BACKEND[it._status]
    const statusChanged = (
      (it.status === 'no_show' && it._status !== 'no_show') ||
      (it.status === 'leave' && it._status !== 'leave') ||
      ((it.status === 'scheduled' || it.status === 'checked_in') && (it._status === 'leave' || it._status === 'no_show'))
    )
    const remarkChanged = (it._remark || '') !== (it.remark || '')
    if (statusChanged || remarkChanged) n++
  }
  return n
})

function originalStatusLabel(s) { return BACKEND_ORIGINAL_LABELS[s] || s || '待上课' }
function originalStatusType(s) { return BACKEND_ORIGINAL_TYPES[s] || 'info' }
// 行级"是否已扣课时"判断（radio / 备注 disable / makeup 按钮 / setAll / onSubmit 复用）
function isConsumedRow(row) { return isConsumed(row && row.status) }

defineExpose({
  /** 重新拉取名单（新页面在归档成功后调用以刷新） */
  async reload() { await loadRoster() },
  /** 当前已加载名单（只读快照） */
  getRoster() { return rosterItems.value.slice() },
  /** 提交当前 dirty 变更（抽屉仍由自己调用；新页面也复用） */
  async submit() { await onSubmit() },
  /** 当前是否有未保存变更（父组件在「结束」前判断要不要先 flush） */
  hasDirty() { return dirtyCount.value > 0 },
  /** 当前未保存变更数（用于 toast 展示） */
  getDirtyCount() { return dirtyCount.value }
})

// 2026-06-26: roster 空时, 拉一遍 CourseEnrollment 把"已报名学生 + 剩余课时"列出来
//   解决"准备上课前虽然还没生成考勤, 但 system 知道谁报了名"的信息缺失。
//   - 只在 schedule.courseInstance 存在 + 当前 roster 为空时拉, 减少无谓请求
//   - 失败/空时 fallback 到原来"可能原因"提示
// 注意: 这两个 ref + 函数必须在 watch(..., { immediate: true }) 之前声明,
//   否则 setup 阶段 immediate 触发时访问 enrolledStudents 会 TDZ (ReferenceError)。
const enrolledStudents = ref([]) // [{ id, name, studentProduct: { remainingLessons, totalLessons, isActive, expireDate, source, giftReason } }]
const enrolledLoading = ref(false)
async function loadEnrolledStudents() {
  const ci = props.schedule && props.schedule.courseInstance
  if (!ci || !ci.id) { enrolledStudents.value = []; return }
  enrolledLoading.value = true
  try {
    const r = await courseEnrollmentApi.list({
      courseInstance: ci.id,
      status: 'enrolled',
      pageSize: 200
    })
    const items = r.data?.items || r.data || []
    // 只取 student + studentProduct 两个关键字段, 避免把整张课程报名文档都拖到前端
    enrolledStudents.value = items.map((e) => ({
      id: e._id || e.id,
      studentId: e.student && (e.student._id || e.student.id),
      name: e.student && e.student.name || '—',
      studentProduct: e.studentProduct || null
    }))
  } catch (err) {
    // 拉失败不阻塞主流程, 退回到原来"可能原因"提示
    enrolledStudents.value = []
    console.warn('加载预报名单失败', err)
  } finally {
    enrolledLoading.value = false
  }
}

watch(
  () => props.schedule && props.schedule._id,
  async () => {
    // 切 schedule 时清空预报名单, 避免上一张排课的数据闪一下
    enrolledStudents.value = []
    if (props.schedule && props.schedule._id) {
      await loadRoster()
      // 2026-06-26: roster 拉完后再决定是否拉预报名单
      if (rosterItems.value.length === 0) {
        loadEnrolledStudents()
      }
    }
  },
  { immediate: true }
)

async function loadRoster() {
  loading.value = true
  try {
    const r = await lessonAttendanceApi.list({
      lessonSchedule: props.schedule._id,
      pageSize: 200
    })
    const raw = r.data?.items || r.data || []
    rosterItems.value = raw.map((it) => {
      // 后端状态 → UI 状态
      let ui = 'present'
      if (it.status === 'no_show') ui = 'no_show'
      else if (it.status === 'leave') ui = 'leave'
      else if (it.status === 'checked_in') ui = 'present'
      else if (it.status === 'completed') ui = 'present'
      // 补课记录：默认显示为"正常"（实际场景里已经是另一条已扣课时的考勤，无需重新登记）
      else if (it.status === 'madeup') ui = 'present'
      return {
        id: it._id || it.id,
        student: it.student,
        studentProduct: it.studentProduct,
        status: it.status,
        evaluation: it.evaluation || null,
        _status: ui,
        _remark: it.remark || '',
        _eval: {
          score: it.evaluation?.score ?? null,
          content: it.evaluation?.content ?? '',
          strengths: it.evaluation?.strengths ?? '',
          improvements: it.evaluation?.improvements ?? ''
        }
      }
    })
    if (props.exposeRoster) emit('loaded', rosterItems.value.slice())
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载名单失败')
  } finally {
    loading.value = false
  }
}

function setAll(status) {
  for (const it of rosterItems.value) {
    if (isConsumed(it.status)) continue
    it._status = status
  }
}

async function onSubmit() {
  if (!props.schedule || !rosterItems.value.length) {
    ElMessage.warning('本节课暂无学生考勤，无需保存')
    return
  }
  submitting.value = true
  try {
    const items = []
    for (const it of rosterItems.value) {
      if (isConsumed(it.status)) continue // 已消课/已补 不可改
      const target = UI_TO_BACKEND[it._status]
      const statusChanged = (
        (it.status === 'no_show' && it._status !== 'no_show') ||
        (it.status === 'leave' && it._status !== 'leave') ||
        ((it.status === 'scheduled' || it.status === 'checked_in') && (it._status === 'leave' || it._status === 'no_show'))
      )
      const remarkChanged = (it._remark || '') !== (it.remark || '')
      if (!statusChanged && !remarkChanged) continue
      items.push({ attendance: it.id, status: target, remark: it._remark || undefined })
    }
    if (items.length === 0) {
      ElMessage.info('没有需要保存的变更')
      emit('saved', { count: 0 })
      return
    }
    await lessonAttendanceApi.bulkMark({
      lessonSchedule: props.schedule._id,
      items
    })
    ElMessage.success(`已保存 ${items.length} 条考勤变更`)
    emit('saved', { count: items.length })
    await loadRoster()
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '保存失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.roster-body { padding: 0 4px; }
.summary {
  background: #f5f7fa;
  border-radius: 6px;
  padding: 12px 16px;
  margin-bottom: 8px;
}
.summary-row { font-size: 13px; line-height: 1.8; color: #303133; }
.summary-row .label { color: #909399; margin-right: 4px; }
.summary-row .value { font-weight: 500; }
/* 2026-06-26: 开班上下文字段（周期/排课计划/总课时/上限），muted 风格紧凑排版 */
.ci-meta-row {
  font-size: 12px;
  color: #909399;
  line-height: 1.6;
  margin-top: -4px;
}
.ci-meta-sep { margin: 0 6px; color: #c0c4cc; }
/* 2026-06-26: roster 空时的"预报名单"小标题 */
.enrolled-section { margin: 12px 0; }
.enrolled-header {
  display: flex; align-items: baseline; gap: 12px;
  margin-bottom: 8px;
}
.enrolled-title { font-weight: 600; font-size: 13px; color: #303133; }
.enrolled-sub { font-size: 12px; }
/* 2026-06-26: 含生命周期按钮的状态行，左侧 label/value，右侧 #header-actions slot。
   用 :has() 检测 slot 是否真有内容，没内容就不占右侧空间，保持原来紧凑。 */
.summary-row--with-actions {
  display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
}
.summary-row--with-actions:has(.summary-actions:empty) .summary-actions { display: none; }
.summary-actions { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.bulk-actions {
  display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebeef5;
}
.bulk-actions .spacer { flex: 1; }
.muted { color: #909399; font-size: 12px; }

/* 2026-06-23: 可展开行 — 课评 + 补课按钮折叠在行内
     左: EvaluationEditor (flex 1, 自动占满)
     右: 状态标记 / 补课按钮 (固定宽度, 居右)
   让行尾不再需要 420px 宽的课评列, 抽屉也不会出现横向滚动. */
.row-expansion {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  background: #fafbfc;
}
.row-expansion-main {
  flex: 1;
  min-width: 0;  /* 关键: 允许 flex 子项收缩, 让 EvaluationEditor 内的 input 不溢出 */
}
.row-expansion-side {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
</style>