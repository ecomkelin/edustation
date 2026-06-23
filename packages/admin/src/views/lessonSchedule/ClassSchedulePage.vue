<template>
  <div class="class-schedule-page">
    <!-- 筛选条 -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filter" @submit.prevent>
        <el-form-item label="状态">
          <el-select v-model="filter.status" multiple collapse-tags collapse-tags-tooltip placeholder="默认 准备中 + 预备 + 进行中" style="width: 280px">
            <el-option v-for="o in STATUS_OPTIONS" :key="o.value" :label="o.label" :value="o.value" />
          </el-select>
        </el-form-item>
        <el-form-item label="开班">
          <el-select v-model="filter.courseInstance" clearable filterable placeholder="全部" style="width: 200px">
            <el-option v-for="ci in courseInstanceOptions" :key="ci._id" :label="ci.name" :value="ci._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="老师">
          <el-select v-model="filter.teacher" clearable filterable placeholder="全部" style="width: 160px">
            <el-option v-for="t in teacherOptions" :key="t._id" :label="t.realName || t.mobile" :value="t._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="教室">
          <el-select v-model="filter.room" clearable filterable placeholder="全部" style="width: 160px">
            <el-option v-for="r in roomOptions" :key="r._id" :label="r.name" :value="r._id" />
          </el-select>
        </el-form-item>
        <el-form-item label="日期范围">
          <el-date-picker
            v-model="dateRange"
            type="datetimerange"
            range-separator="-"
            start-placeholder="从"
            end-placeholder="到"
            value-format="YYYY-MM-DD HH:mm:ss"
            style="width: 360px"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="loading" @click="onSearch">查询</el-button>
          <el-button @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 卡片列表 -->
    <div v-loading="loading" class="card-list">
      <el-empty
        v-if="!loading && items.length === 0"
        :description="emptyDescription"
      >
        <el-button v-if="hasActiveDateRange" type="primary" plain size="small" @click="clearDateRange">
          清空日期范围
        </el-button>
        <el-button v-else type="primary" plain size="small" @click="onReset">
          重置筛选
        </el-button>
      </el-empty>

      <el-card
        v-for="row in items"
        :key="row._id"
        class="schedule-card"
        shadow="hover"
      >
        <div class="card-header" @click="toggleExpand(row)">
          <div class="meta">
            <span class="ci-name">{{ ciName(row) }}</span>
            <span class="muted">·</span>
            <span class="lesson-no">第 {{ row.lessonNo }} 课</span>
            <el-tag :type="statusType(row.status)" size="small" effect="dark" style="margin-left: 8px">{{ statusLabel(row.status) }}</el-tag>
            <span class="muted time">{{ formatDate(row.plannedStartTime, 'MM-DD HH:mm') }} - {{ formatDate(row.plannedEndTime, 'HH:mm') }}</span>
          </div>
          <div class="actions" @click.stop>
            <!-- 状态管理按钮统一在此页面（上课表）；色板区分：
                 准备上课=蓝(primary) / 开始上课=橙(warning) / 结束=绿(success) / 归档=红(danger) -->
            <!-- 准备中(preparing) → 开始上课：橙色，与「准备上课」明显区分 -->
            <el-button v-if="row.status === 'preparing'" type="warning" size="small" :loading="actionLoading[row._id]" @click="onStart(row)">开始上课</el-button>
            <!-- 预备上课(scheduled) → 准备上课：蓝色，与「开始上课」区分 -->
            <el-button v-if="row.status === 'scheduled'" type="primary" size="small" :loading="actionLoading[row._id]" @click="onPrepare(row)">准备上课</el-button>
            <!-- 正在上课 → 结束：绿色 -->
            <el-button v-if="row.status === 'in_progress'" type="success" size="small" :loading="actionLoading[row._id]" @click="openFinishDialog(row)">结束</el-button>
            <!-- 已结束：归档（按需启用）：红色 -->
            <el-tooltip v-if="row.status === 'completed'" :content="archiveTooltip(row)" placement="top">
              <span>
                <el-button type="danger" size="small" :loading="actionLoading[row._id]" :disabled="!archiveEnabled(row)" @click="onArchive(row)">归档</el-button>
              </span>
            </el-tooltip>
            <!-- 已归档：只读 -->
            <span v-if="row.status === 'archived'" class="muted">已归档</span>
            <!-- 「补齐名单」：prepare 之后又报名/购课/赠课的学生，名单里没有，需手动补建（修 prepare 一次性生成的 bug）
                 显隐规则：仅当 preparing/in_progress/completed/archived 状态 且 预览接口返回 toCreate > 0 时显示。
                 按钮上挂数字徽标，文案"补齐名单（N）"。 -->
            <el-tooltip v-if="['preparing','in_progress','completed','archived'].includes(row.status) && (syncToCreate[row._id] ?? 0) > 0" content="为该排课补建尚未生成考勤的已报名学生" placement="top">
              <el-button size="small" :loading="syncLoading[row._id]" @click="onSyncAttendances(row)">补齐名单（{{ syncToCreate[row._id] }}）</el-button>
            </el-tooltip>
            <el-button class="expand-btn" :icon="expanded[row._id] ? ArrowUp : ArrowDown" link size="small" @click="toggleExpand(row)">
              {{ expanded[row._id] ? '收起' : '展开' }}
            </el-button>
          </div>
        </div>

        <!-- 展开体：考勤名单 + 课评表单 -->
        <div v-if="expanded[row._id]" class="card-body">
          <AttendanceRosterTable
            :ref="(el) => bindRosterRef(row._id, el)"
            :schedule="row"
            :read-only="row.status !== 'in_progress'"
            :expose-roster="true"
            @loaded="(r) => onRosterLoaded(row, r)"
            @saved="onRosterSaved"
          >
            <template v-if="row.status === 'completed' || row.status === 'archived'" #row-extra>
              <!-- 已结束/已归档的考勤：行尾追加课评列；
                   仅「已消课/已补」行渲染课评编辑，未消课行（leave / no_show / scheduled / checked_in）显示「—」，
                   跟 2026-06 课评只对已消课/已补有效的服务端语义保持一致 -->
              <el-table-column label="课评" min-width="420">
                <template #default="{ row: attRow }">
                  <EvaluationEditor
                    v-if="attRow.status === 'completed' || attRow.status === 'madeup'"
                    :attendance="attRow"
                    :read-only="row.status === 'archived'"
                    @saved="onEvaluationSaved(row, $event)"
                  />
                  <span v-else class="muted">—</span>
                </template>
              </el-table-column>
            </template>
            <!-- 「补课」操作列插槽：AttendanceRosterTable 在已结束/已归档状态下对未消课行渲染这里的内容。
                 点击弹出补课确认框，调用 /lesson-attendances/:id/makeup 接口。 -->
            <template #row-makeup="{ row: attRow }">
              <el-button
                type="primary"
                size="small"
                link
                :loading="makeupLoading[attRow.id]"
                @click="openMakeupDialog(row, attRow)"
              >补课</el-button>
            </template>
          </AttendanceRosterTable>
        </div>
      </el-card>
    </div>

    <!-- 分页 -->
    <el-pagination
      v-model:current-page="filter.page"
      v-model:page-size="filter.pageSize"
      :total="total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      style="margin-top: 12px; justify-content: flex-end"
      @current-change="fetchList"
      @size-change="fetchList"
    />

    <!-- 结束上课弹框：教务填实际下课时间 -->
    <el-dialog v-model="finishDialog" title="结束上课" width="480px" :close-on-click-modal="false">
      <el-form label-width="100px">
        <el-form-item label="计划时间">
          <span class="muted">
            {{ finishTarget ? `${formatDate(finishTarget.plannedStartTime, 'YYYY-MM-DD HH:mm')} ~ ${formatDate(finishTarget.plannedEndTime, 'HH:mm')}` : '' }}
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
            type="textarea"
            :rows="2"
            maxlength="500"
            show-word-limit
            :placeholder="finishNeedsReason ? '实际时间与计划相差 ≥5 分钟，请填写理由' : '可选'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="finishDialog = false">取消</el-button>
        <el-button type="primary" :loading="actionLoading[finishTarget?._id]" @click="submitFinish">确定结束</el-button>
      </template>
    </el-dialog>

    <!-- 补课弹框：已结束/已归档排课的某条未消课考勤 -->
    <el-dialog v-model="makeupDialog" title="补课" width="480px" :close-on-click-modal="false">
      <el-form v-if="makeupTarget" label-width="100px">
        <el-form-item label="学生">
          <span class="value">{{ makeupTarget.attendance.student?.name || '—' }}</span>
        </el-form-item>
        <el-form-item label="原排课">
          <span class="muted">
            第 {{ makeupTarget.schedule.lessonNo }} 课 ·
            {{ formatDate(makeupTarget.schedule.plannedStartTime, 'YYYY-MM-DD HH:mm') }}
          </span>
        </el-form-item>
        <el-form-item label="原考勤状态">
          <el-tag :type="originalStatusType(makeupTarget.attendance.status)" size="small" effect="plain">
            {{ originalStatusLabel(makeupTarget.attendance.status) }}
          </el-tag>
        </el-form-item>
        <el-form-item label="说明">
          <el-alert type="info" :closable="false" show-icon>
            补课将按 FIFO 自动从该学生持有的匹配课包中扣减 1 课时，生成一条新的「已消课」考勤记录。补课不强求填写课评，可在完成后单独补评。
          </el-alert>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="makeupForm.remark"
            type="textarea"
            :rows="2"
            maxlength="200"
            show-word-limit
            placeholder="可选；记录补课原因/特殊说明"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="makeupDialog = false">取消</el-button>
        <el-button
          type="primary"
          :loading="makeupLoading[makeupTarget?.attendance?.id]"
          @click="submitMakeup"
        >确认补课</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowUp, ArrowDown } from '@element-plus/icons-vue'
import AttendanceRosterTable from './AttendanceRosterTable.vue'
import EvaluationEditor from './EvaluationEditor.vue'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { courseInstanceApi } from '@/api/courseInstance'
import { userApi } from '@/api/user'
import { roomApi } from '@/api/room'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { formatDate } from '@/utils/format'

// ─── 常量 ──────────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: 'preparing', label: '准备中' },
  { value: 'scheduled', label: '预备上课' },
  { value: 'in_progress', label: '进行中' },
  { value: 'completed', label: '已结束' },
  { value: 'archived', label: '已归档' }
]
const STATUS_LABELS = {
  preparing: '准备中', scheduled: '预备上课', in_progress: '进行中', completed: '已结束', archived: '已归档', cancelled: '已取消'
}
// el-tag 的 type 校验只接受 primary/success/info/warning/danger，
// archived 是中性状态用 info；fallback 也不能用 ''，未知状态用 info。
const STATUS_TYPES = {
  preparing: 'primary', scheduled: 'info', in_progress: 'warning', completed: 'success', archived: 'info', cancelled: 'danger'
}

function statusLabel(s) { return STATUS_LABELS[s] || s }
function statusType(s) { return STATUS_TYPES[s] || 'info' }
function ciName(row) {
  const ci = row.courseInstance
  if (!ci) return '—'
  return ci.name || (ci.courseProduct && ci.courseProduct.name) || '—'
}

// ─── 默认日期范围：今天 -7d ~ +3mo ─────────────────────────
// 说明：教务"上课表"需要看到本周已上、未来一学期要上的课。
// 默认 -7d ~ +3mo 覆盖"上周 + 未来三个月"，班课每周一次的稀疏场景也能看到完整周期。
function defaultDateRange() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(start.getDate() - 7)
  start.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setMonth(end.getMonth() + 3)
  end.setHours(23, 59, 59, 999)
  return [start.toISOString(), end.toISOString()]
}

// ─── 筛选 / 数据 ──────────────────────────────────────────
const filter = reactive({
  status: ['preparing', 'scheduled', 'in_progress', 'completed'],
  courseInstance: null,
  teacher: null,
  room: null,
  page: 1,
  pageSize: 20
})
const dateRange = ref(defaultDateRange())

const items = ref([])
const total = ref(0)
const loading = ref(false)
const actionLoading = reactive({}) // { [scheduleId]: boolean }
const expanded = reactive({})      // { [scheduleId]: boolean }
const rosterBySchedule = reactive({}) // { [scheduleId]: [...] } —— 跟踪每张卡片已加载的名单
const rosterRefs = {}              // 引用 AttendanceRosterTable 实例，用于 reload

const courseInstanceOptions = ref([])
const teacherOptions = ref([])
const roomOptions = ref([])

function bindRosterRef(id, el) { if (el) rosterRefs[id] = el }

// ─── 数据拉取 ─────────────────────────────────────────────
async function fetchList() {
  loading.value = true
  try {
    const params = {
      statuses: filter.status.join(','),
      courseInstance: filter.courseInstance || undefined,
      teacher: filter.teacher || undefined,
      room: filter.room || undefined,
      from: dateRange.value?.[0],
      to: dateRange.value?.[1],
      page: filter.page,
      pageSize: filter.pageSize
    }
    const r = await lessonScheduleApi.list(params)
    const data = r.data || {}
    items.value = data.items || []
    total.value = data.total || 0
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '加载排课失败')
  } finally {
    loading.value = false
  }
}

async function fetchOptions() {
  try {
    const [ci, users, rooms] = await Promise.all([
      courseInstanceApi.list({ pageSize: 200 }),
      userApi.list({ pageSize: 200 }),
      roomApi.list({ pageSize: 200 })
    ])
    // 过滤掉 _id 缺失的项：<el-option :value> 不接受 null/undefined，
    // 否则 el-select 渲染时会触发 "Invalid prop: type check failed for prop 'value'" 警告。
    courseInstanceOptions.value = (ci.data?.items || ci.data || []).filter((x) => x && x._id)
    teacherOptions.value = (users.data?.items || users.data || []).filter((u) => u && u._id && u.isActive !== false)
    roomOptions.value = (rooms.data?.items || rooms.data || []).filter((r) => r && r._id)
  } catch (e) {
    // 选项加载失败不阻塞主页面
    // eslint-disable-next-line no-console
    console.warn('加载筛选选项失败', e)
  }
}

function onSearch() { filter.page = 1; fetchList() }
function onReset() {
  filter.status = ['preparing', 'scheduled', 'in_progress', 'completed']
  filter.courseInstance = null
  filter.teacher = null
  filter.room = null
  filter.page = 1
  dateRange.value = defaultDateRange()
  fetchList()
}

// 空状态：区分"日期范围挡住数据" vs "真的没有排课"
const hasActiveDateRange = computed(() => {
  const r = dateRange.value
  return Array.isArray(r) && r[0] && r[1]
})
const emptyDescription = computed(() => {
  if (hasActiveDateRange.value) return '当前日期范围内没有排课。可点击下方按钮清空日期范围查看全部，或调整日期 / 状态。'
  return '暂无符合条件的排课。请检查状态或开班筛选条件。'
})
function clearDateRange() {
  dateRange.value = null
  filter.page = 1
  fetchList()
}

function toggleExpand(row) { expanded[row._id] = !expanded[row._id] }

// ─── 课评编辑 / 归档判定 ──────────────────────────────────
function onRosterLoaded(row, roster) {
  rosterBySchedule[row._id] = roster
  // 首次加载该卡片名单时，异步拉一次"潜在需要补齐人数"以决定"补齐名单"按钮是否显示
  if (syncToCreate[row._id] === undefined) {
    refreshSyncPreview(row)
  }
}

function onRosterSaved() {
  // 重拉当前卡片名单（保证 status / actualStartTime 等同步）
  // 注意：roster 已经在内部 reload 过；这里只是把缓存覆盖一次
  Object.values(rosterRefs).forEach((ref) => ref && ref.reload && ref.reload())
}

async function onEvaluationSaved(row, payload) {
  // 把刚保存的课评写回本卡片 roster 缓存；archivedEnabled 派生计算会即时刷新
  const roster = rosterBySchedule[row._id] || []
  const target = roster.find((a) => a.id === payload.attendanceId)
  if (target) {
    target.evaluation = { ...(target.evaluation || {}), ...payload.evaluation, evaluatedAt: payload.evaluatedAt }
  }
  // 强制 Vue 重新计算 computed 视图：拷贝整个对象引用
  rosterBySchedule[row._id] = roster.slice()
}

// ─── 状态切换：withAction 工具 + prepare / start / finish ───
async function withAction(scheduleId, fn) {
  actionLoading[scheduleId] = true
  try {
    return await fn()
  } finally {
    actionLoading[scheduleId] = false
  }
}

async function onPrepare(row) {
  await withAction(row._id, async () => {
    try {
      await lessonScheduleApi.prepare(row._id)
      ElMessage.success('已进入准备中状态')
      await fetchList()
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || '准备上课失败')
    }
  })
}

async function onStart(row) {
  await withAction(row._id, async () => {
    try {
      await lessonScheduleApi.start(row._id)
      ElMessage.success('已开始上课')
      await fetchList()
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || '开始上课失败')
    }
  })
}

// 结束上课弹框：选完实际下课时间后调 finish 接口
const finishDialog = ref(false)
const finishTarget = ref(null) // 当前正在结束的那张排课
const finishForm = reactive({
  actualEndTime: '',
  actualEndReason: ''
})
// 当实际结束时间与计划结束时间相差 ≥ 5 分钟时，强制要求填写理由
const finishNeedsReason = computed(() => {
  if (!finishTarget.value || !finishForm.actualEndTime) return false
  const plan = finishTarget.value.plannedEndTime
    ? new Date(finishTarget.value.plannedEndTime).getTime()
    : null
  if (!plan) return false
  const act = new Date(finishForm.actualEndTime).getTime()
  if (Number.isNaN(act)) return false
  return Math.abs(act - plan) >= 5 * 60 * 1000
})

// 关键拦截：本节课名单若还有未保存的考勤变更，先提示用户保存再打开结束弹框。
// 业务约束（2026-06）：用户若改了「正常/迟到/请假/未到」单选但没点「保存考勤」，
// 这些变更只在本地（row._status），没传到后端。此时若直接点结束，
// 后端 bulkCompleteForSchedule 会把所有 scheduled/checked_in 当「到课」自动消课并扣课时，
// 用户标记的「请假/未到」被静默吞掉，且没有任何「补课」按钮可以挽回
// （已 completed 行不再允许改回 leave/no_show，makeup 又是新建一条）。
// 因此结束前必须先 flush。本函数返回时已经确保 dirty 已处理（保存 or 用户主动放弃）。
async function openFinishDialog(row) {
  const ref = rosterRefs[row._id]
  if (ref && typeof ref.hasDirty === 'function' && ref.hasDirty()) {
    const dirty = typeof ref.getDirtyCount === 'function' ? ref.getDirtyCount() : 0
    try {
      await ElMessageBox.confirm(
        `本节课名单有 ${dirty} 处考勤变更尚未保存（正常/迟到/请假/未到 等）。\n` +
        `若直接结束，后端会按「到课」自动消课并扣减学生课包，您标记的「请假/未到」将被忽略。\n\n` +
        `是否先保存这些变更再结束？`,
        '请先保存考勤变更',
        {
          type: 'warning',
          confirmButtonText: '先保存考勤',
          cancelButtonText: '放弃变更，继续结束',
          showClose: false
        }
      )
      // 用户选择「先保存考勤」：flush 后继续往下走打开结束弹框
      if (typeof ref.submit === 'function') await ref.submit()
    } catch {
      // 用户选择「放弃变更，继续结束」—— 走旧行为（用户明确选择放弃本地变更）
    }
  }
  finishTarget.value = row
  // 默认填计划结束时间，教务可改
  finishForm.actualEndTime = row.plannedEndTime
    ? formatDate(row.plannedEndTime, 'YYYY-MM-DD HH:mm:ss')
    : formatDate(new Date(), 'YYYY-MM-DD HH:mm:ss')
  finishForm.actualEndReason = ''
  finishDialog.value = true
}

async function submitFinish() {
  if (!finishTarget.value) return
  if (!finishForm.actualEndTime) {
    ElMessage.warning('请填写实际下课时间')
    return
  }
  if (finishNeedsReason.value && !finishForm.actualEndReason) {
    ElMessage.warning('实际时间与计划相差 ≥5 分钟，请填写理由')
    return
  }
  const target = finishTarget.value
  await withAction(target._id, async () => {
    try {
      await lessonScheduleApi.finish(target._id, {
        actualEndTime: finishForm.actualEndTime,
        actualEndReason: finishForm.actualEndReason || undefined
      })
      ElMessage.success('已结束上课')
      finishDialog.value = false
      await fetchList()
      // 关键：finish 后端会跑 bulkCompleteForSchedule 把所有 scheduled/checked_in 转 completed；
      // AttendanceRosterTable 只在 schedule._id 变化时 reload，所以这里手动 reload 一次，
      // 否则 UI 上仍显示旧状态（"待上课"/"已签到"），与实际后端不一致；
      // 也会导致「已消课」标签、补课后新行的 status 等无法反映。
      const ref = rosterRefs[target._id]
      if (ref && typeof ref.reload === 'function') {
        await ref.reload()
        if (typeof ref.getRoster === 'function') {
          // 同步父级 rosterBySchedule，让 archiveEnabled / archiveTooltip 即时重算
          onRosterLoaded(target, ref.getRoster())
        }
      }
    } catch (e) {
      ElMessage.error(e?.response?.data?.message || '结束上课失败')
    }
  })
}

function archiveEnabled(row) {
 if (row.status !== 'completed') return false
 const roster = rosterBySchedule[row._id] || []
 if (!roster.length) return true // 空名单：所有学生都无产品，不生成考勤，直接可归档
 //2026-06修订：仅「已消课/已补」且未写课评的考勤阻塞归档；
 // 其他状态（leave / no_show / scheduled / checked_in）都允许归档（可走「补课」机制）。
 return roster.every((a) =>
 (a.status !== 'completed' && a.status !== 'madeup') ||
 (a.evaluation && a.evaluation.evaluatedAt)
 )
}

function archiveTooltip(row) {
 if (row.status !== 'completed') return ''
 const roster = rosterBySchedule[row._id] || []
 if (!roster.length) return '名单为空，可直接归档'
 const missing = roster.filter((a) =>
 (a.status === 'completed' || a.status === 'madeup') && !(a.evaluation && a.evaluation.evaluatedAt)
 )
 if (missing.length ===0) return '所有「已消课/已补」学生均已评价，可以归档'
 return `还有 ${missing.length} 名「已消课/已补」学生未评价课评`
}

// 「补齐名单」：为该排课补建尚未生成考勤的已报名学生（修 prepare 一次性生成的 bug；幂等，可重复点）
const syncLoading = reactive({})  // { [scheduleId]: boolean }
const syncToCreate = reactive({}) // { [scheduleId]: number } 潜在需要补齐的学生数；用于按钮显隐与徽标
/**
 * 刷新某排课的"潜在需要补齐人数"。调 /sync-attendances/preview 接口。
 * 用于：1) 卡片首次加载名单后；2) 补齐成功或任何 roster 变化后。
 * 失败时静默置 0（按钮隐式隐藏，不打扰用户）。
 */
async function refreshSyncPreview(row) {
  try {
    const r = await lessonScheduleApi.previewSyncAttendances(row._id)
    syncToCreate[row._id] = r.data?.toCreate ?? 0
  } catch {
    syncToCreate[row._id] = 0
  }
}
async function onSyncAttendances(row) {
  try {
    await ElMessageBox.confirm(
      '将为该排课补建所有「已报名且持有效课包」但尚未生成考勤的学生考勤，是否继续？',
      '补齐名单',
      { type: 'info' }
    )
  } catch { return }
  syncLoading[row._id] = true
  try {
    const r = await lessonScheduleApi.syncAttendances(row._id)
    const created = r.data?.created ?? 0
    ElMessage.success(created > 0 ? `已补齐 ${created} 名学生考勤` : '名单已完整，无需补齐')
    // 刷新本卡片名单（AttendanceRosterTable 暴露了 reload）
    const ref = rosterRefs[row._id]
    if (ref && typeof ref.reload === 'function') await ref.reload()
    // 同步外部 roster 缓存（让 archiveEnabled 重新计算）
    if (ref && typeof ref.getRoster === 'function') {
      onRosterLoaded(row, ref.getRoster())
    }
    // 重新拉取 preview：created 后 toCreate 应变为 0，按钮自动隐式消失
    await refreshSyncPreview(row)
  } catch (e) {
    ElMessage.error(e?.response?.data?.message || '补齐失败')
  } finally {
    syncLoading[row._id] = false
  }
}

async function onArchive(row) {
  try {
    await ElMessageBox.confirm('归档后状态将变为"已归档"，是否继续？', '归档确认', { type: 'success' })
  } catch { return }
  await withAction(row._id, async () => {
    try {
      await lessonScheduleApi.archive(row._id)
      ElMessage.success('已归档')
      await fetchList()
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

// 监听 status 数组变化时自动刷新（仅在数组引用变化时触发；多选不会改变数组引用故配合查询按钮）
// 这里我们让用户主动点"查询"以避免每次勾选都触发请求。

onMounted(async () => {
  await fetchOptions()
  await fetchList()
})
// ─── 「补课」相关：弹框 + 提交 ──────────────────────────────
// 仅在排课已结束/已归档时由行尾「补课」按钮触发；
// 服务端自动 FIFO 选 StudentProduct 原子扣 1 课时，UI 只负责确认与展示。
// 考勤状态 → 标签（dialog 复用）
const MAKEUP_STATUS_LABELS = {
 scheduled: '待上课', checked_in: '已签到', completed: '已消课', madeup: '已补', no_show: '未到', leave: '请假'
}
// leave 改 info；fallback 也用 info（不能再用 ''）
const MAKEUP_STATUS_TYPES = {
  scheduled: 'info', checked_in: 'warning', completed: 'success', madeup: 'warning', no_show: 'danger', leave: 'info'
}
function originalStatusLabel(s) { return MAKEUP_STATUS_LABELS[s] || s || '—' }
function originalStatusType(s) { return MAKEUP_STATUS_TYPES[s] || 'info' }
const makeupLoading = reactive({}) // { [attendanceId]: boolean }
const makeupDialog = ref(false)
const makeupTarget = ref(null) // { schedule, attendance }
const makeupForm = reactive({ remark: '' })
function openMakeupDialog(schedule, attendance) {
 makeupTarget.value = { schedule, attendance }
 makeupForm.remark = ''
 makeupDialog.value = true
}
async function submitMakeup() {
 if (!makeupTarget.value) return
 const { attendance } = makeupTarget.value
 makeupLoading[attendance.id] = true
 try {
 const r = await lessonAttendanceApi.makeup(attendance.id, { remark: makeupForm.remark || undefined })
 ElMessage.success('已补课；学生课包 -1')
 makeupDialog.value = false
 // 刷新本卡片名单（AttendanceRosterTable 暴露了 reload）
 const ref = rosterRefs[makeupTarget.value.schedule._id]
 if (ref && typeof ref.reload === 'function') await ref.reload()
 // 同步外部 roster 缓存（让 archiveEnabled 重新计算）
 if (ref && typeof ref.getRoster === 'function') {
 onRosterLoaded(makeupTarget.value.schedule, ref.getRoster())
 }
 } catch (e) {
 ElMessage.error(e?.response?.data?.message || '补课失败')
 } finally {
 makeupLoading[attendance.id] = false
 }
}

</script>

<style scoped>
.class-schedule-page { padding: 0; }
.filter-card { margin-bottom: 12px; }
.card-list { display: flex; flex-direction: column; gap: 12px; }
.schedule-card { transition: box-shadow .2s; }
.card-header {
  display: flex; align-items: center; justify-content: space-between;
  cursor: pointer; user-select: none;
}
.card-header .meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.card-header .ci-name { font-weight: 600; font-size: 15px; }
.card-header .lesson-no { font-weight: 500; }
.card-header .time { font-size: 12px; margin-left: 12px; }
.card-header .actions { display: flex; align-items: center; gap: 6px; }
.card-header .muted { color: #909399; }
.card-body { margin-top: 12px; padding-top: 12px; border-top: 1px solid #ebeef5; }
.expand-btn { padding: 4px 6px; }
</style>
