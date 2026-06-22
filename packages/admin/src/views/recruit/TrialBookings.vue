<template>
  <div class="trial-bookings-page">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-row">
        <el-date-picker
          v-model="filters.dateRange"
          type="daterange"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
          style="width: 320px"
          @change="load"
        />
        <el-select
          v-model="filters.subject"
          clearable
          filterable
          placeholder="按科目类别筛选"
          style="width: 180px"
          @change="load"
        >
          <el-option
            v-for="s in trialSubjectCategoryOptions"
            :key="s._id"
            :label="s.name"
            :value="s._id"
          />
        </el-select>
        <el-select
          v-model="filters.ageRange"
          clearable
          placeholder="按年龄段筛选"
          style="width: 160px"
          @change="load"
        >
          <el-option
            v-for="r in AGE_RANGE_OPTIONS"
            :key="r.value"
            :label="r.label"
            :value="r.value"
          />
        </el-select>
        <el-button :icon="Refresh" @click="onReset">重置</el-button>

        <div class="spacer" />
        <span class="counts">
          已选 <strong>{{ selectedRows.length }}</strong> 条
        </span>
        <el-button
          type="primary"
          :disabled="selectedRows.length === 0"
          @click="batchDialog.visible = true"
        >
          批量排日程
        </el-button>
      </div>
    </el-card>

    <!-- 看板 (按状态 tab) -->
    <el-card class="board-card" shadow="never">
      <el-tabs v-model="activeTab" @tab-change="onTabChange">
        <el-tab-pane
          v-for="tab in TABS"
          :key="tab.value"
          :name="tab.value"
        >
          <template #label>
            <span>{{ tab.label }} ({{ counts[tab.value] }})</span>
          </template>
          <el-table
            v-loading="loading"
            :data="rows"
            border
            stripe
            :empty-text="loading ? '加载中' : '暂无数据'"
            :row-class-name="rowClassName"
            @selection-change="onSelectionChange"
          >
            <el-table-column v-if="tab.value === 'awaiting_schedule'" type="selection" width="50" />
            <el-table-column label="孩子姓名" min-width="100">
              <template #default="{ row }">{{ row.preStudent?.name || '-' }}</template>
            </el-table-column>
            <el-table-column label="联系电话" width="130">
              <template #default="{ row }">
                <!-- 2026-06-16: 修老 bug — 显示家长电话而非潜客自己的"电话"
                     - preStudent (ChildLead) 本身没 phone 字段, phone 在 Parent 上
                     - 优先级: preStudent.parent.phone (新结构) → parent.phone (TrialBooking 冗余) → 兜底 '未登记'
                     - 业务上"潜客没建 Parent" 也常见 (录入后还没转化), 给明确文案比"-"好 -->
                <span v-if="row.preStudent?.parent?.phone">{{ row.preStudent.parent.phone }}</span>
                <span v-else-if="row.parent?.phone">{{ row.parent.phone }}</span>
                <span v-else class="muted">未登记</span>
              </template>
            </el-table-column>
            <el-table-column label="第几次" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.attemptNo > 1" size="small" type="info">第 {{ row.attemptNo }} 次</el-tag>
                <span v-else>1</span>
              </template>
            </el-table-column>
            <el-table-column label="试听科目类别" min-width="110">
              <template #default="{ row }">
                <span v-if="row.subject?.name">{{ row.subject.name }}</span>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="试听老师" min-width="100">
              <template #default="{ row }">
                {{ row.teacher?.realName || row.teacher?.mobile || '-' }}
              </template>
            </el-table-column>
            <!-- 2026-06-16: 已约 tab 的"计划时间"列根据距离今天的天数动态着色 -->
            <el-table-column label="计划时间" width="180">
              <template #default="{ row }">
                <span :class="['time-cell', timeClass(row.scheduledAt)]">
                  {{ formatTime(row.scheduledAt) }}
                </span>
                <div v-if="row.scheduledAt && activeTab === 'scheduled'" class="time-relative">
                  {{ timeRelativeLabel(row.scheduledAt) }}
                </div>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag :type="TRIAL_BOOKING_STATUS_TAG_TYPE[row.status]" size="small">
                  {{ TRIAL_BOOKING_STATUS_LABEL[row.status] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="邀约人" min-width="100">
              <template #default="{ row }">
                <span v-if="row.preStudent?.inviteTeacher?.realName">
                  {{ row.preStudent.inviteTeacher.realName }}
                </span>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <!-- 2026-06-21: 谈单老师列 — 走顶级 consultant 字段 (替代 result.negotiateTeacher)
                 - 后端 list 已 populate 'consultant, mobile realName'
                 - 只在 completed 状态有意义 (isEnrolled=true 时才填), 流程 tab 显示 "-"
                 - 业务上"已报名" tab 销售最关注"谁谈的单" -->
            <el-table-column label="谈单老师" min-width="100">
              <template #default="{ row }">
                <span v-if="row.consultant?.realName">
                  {{ row.consultant.realName }}
                </span>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <!-- 2026-06-16: 备注列 — 之前填了不显示, 现在用 el-tooltip 截长 -->
            <el-table-column label="备注" min-width="140">
              <template #default="{ row }">
                <el-tooltip
                  v-if="row.remark"
                  :content="row.remark"
                  placement="top"
                  :show-after="200"
                >
                  <span class="remark-cell">{{ row.remark }}</span>
                </el-tooltip>
                <span v-else class="muted">-</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="280" fixed="right">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'scheduled'"
                  size="small"
                  type="primary"
                  link
                  @click="openSignIn(row)"
                >到店/完成</el-button>
                <el-button
                  v-if="row.status === 'arrived'"
                  size="small"
                  type="success"
                  link
                  @click="openSignIn(row)"
                >完成试听</el-button>
                <el-button
                  v-if="row.status === 'completed' && row.result?.isEnrolled === null"
                  size="small"
                  type="warning"
                  link
                  @click="openSignIn(row)"
                >补填结果</el-button>
                <el-button
                  v-if="row.status === 'completed' && row.result?.isEnrolled === true && !row.result?.enrolledAt"
                  size="small"
                  type="success"
                  link
                  @click="openSignIn(row)"
                >转化</el-button>
                <!-- 2026-06-20: considering 顶级 status — 谈单老师后续跟进, 这里让用户能重新打开 dialog 跟进/定夺 -->
                <el-button
                  v-if="row.status === 'considering'"
                  size="small"
                  type="warning"
                  link
                  @click="openSignIn(row)"
                >跟进</el-button>
                <!-- 2026-06-16: 已约态精细调整 (替代"标记未到") -->
                <el-button
                  v-if="row.status === 'scheduled'"
                  size="small"
                  link
                  @click="openRescheduleTime(row)"
                >改预约时间</el-button>
                <el-button
                  v-if="row.status === 'scheduled'"
                  size="small"
                  type="info"
                  link
                  @click="onRevertToUnscheduled(row)"
                >退回未约</el-button>
                <el-button
                  v-if="row.status === 'awaiting_schedule' || row.status === 'scheduled'"
                  size="small"
                  type="danger"
                  link
                  @click="onCancel(row)"
                >取消</el-button>
                <!-- 2026-06-16: 取消后再约一次 (cancelled tab; 旧 booking 留审计, 新建一笔 attemptNo+1) -->
                <el-button
                  v-if="row.status === 'cancelled'"
                  size="small"
                  type="warning"
                  link
                  @click="openRescheduleFromCancelled(row)"
                >再约一次</el-button>
                <!-- 误操删除: 仅「已取消」状态可删; 仅超管可见; 走 requirePlatformPassword (超管+密码) -->
                <DestructiveConfirm
                  v-if="row.status === 'cancelled' && isPlatformAdmin"
                  :target="`试听预约 (${row.preStudent?.name} - 第 ${row.attemptNo} 次)`"
                  warning="中风险"
                  :precheck-notes="['当前状态 = 「已取消」']"
                  :precheck="() => trialBookingApi.removableCheck(row._id).then((r) => r.data)"
                  @confirm="(p) => onRemove(row, p)"
                >
                  <el-button size="small" type="danger" link>删除</el-button>
                </DestructiveConfirm>
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
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 批量排日程 dialog (2026-06: 试听不再走排课系统, 排的是"试听日程") -->
    <BatchScheduleDialog
      v-model:visible="batchDialog.visible"
      :bookings="selectedRows"
      @scheduled="onBatchScheduled"
    />

    <!-- 到店打卡 / 完成 / 转化 dialog -->
    <TrialBookingSignInDialog
      v-model:visible="signInDialog.visible"
      :booking="signInDialog.booking"
      @updated="onSignInUpdated"
    />

    <!-- 2026-06-16: 改预约时间 / 再约一次 共用 dialog (mode 区分行为) -->
    <el-dialog
      :model-value="rescheduleDialog.visible"
      :title="rescheduleDialogTitle"
      width="520px"
      :close-on-click-modal="false"
      @update:model-value="(v) => (rescheduleDialog.visible = v)"
    >
      <el-form
        ref="rescheduleFormRef"
        :model="rescheduleDialog.form"
        :rules="rescheduleRules"
        label-width="100px"
        label-position="right"
      >
        <el-form-item v-if="rescheduleDialog.mode === 'time'" label="当前时间">
          <span class="muted">{{ formatTime(rescheduleDialog.booking?.scheduledAt) }}</span>
        </el-form-item>
        <el-form-item v-if="rescheduleDialog.mode === 'cancelled'" label="取消时间">
          <span class="muted">{{ rescheduleDialog.booking?.updatedAt ? formatTime(rescheduleDialog.booking.updatedAt) : '-' }}</span>
        </el-form-item>
        <el-form-item label="新开始时间" prop="plannedStartTime">
          <el-date-picker
            v-model="rescheduleDialog.form.plannedStartTime"
            type="datetime"
            placeholder="选择新开始时间"
            value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="新结束时间" :prop="rescheduleDialog.mode === 'cancelled' ? 'plannedEndTime' : ''">
          <el-date-picker
            v-model="rescheduleDialog.form.plannedEndTime"
            type="datetime"
 :placeholder="rescheduleDialog.mode === 'cancelled' ? '选择新结束时间' : '选择新结束时间 (不填则保持原时长)'"
            value-format="YYYY-MM-DDTHH:mm:ss.SSS[Z]"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="试听老师" :prop="rescheduleDialog.mode === 'cancelled' ? 'teacher' : ''">
          <el-select
            v-model="rescheduleDialog.form.teacher"
            filterable
            :placeholder="rescheduleDialog.mode === 'cancelled' ? '选择老师' : '不填则保持原老师'"
            :clearable="rescheduleDialog.mode !== 'cancelled'"
            style="width: 100%"
          >
            <el-option
              v-for="u in teacherOptions"
              :key="u._id || u.id"
              :label="`${u.realName || ''} (${u.mobile || ''})`.trim()"
              :value="u._id || u.id"
            />
          </el-select>
        </el-form-item>
        <el-alert
          v-if="rescheduleDialog.mode === 'cancelled'"
          type="info"
          :closable="false"
          show-icon
          class="mt"
        >
          <template #title>
            将为该孩子创建第 {{ (rescheduleDialog.booking?.attemptNo || 0) + 1 }} 次试听预约 (旧记录保留作审计)
          </template>
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="rescheduleDialog.visible = false">取消</el-button>
        <el-button :type="rescheduleDialog.mode === 'cancelled' ? 'warning' : 'primary'" :loading="rescheduleDialog.submitting" @click="confirmReschedule">
          {{ rescheduleDialog.mode === 'cancelled' ? '再约一次' : '确认修改' }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { trialBookingApi } from '@/api/trialBooking'
import { userApi } from '@/api/user'
import { categoryApi } from '@/api/category'
import { TRIAL_BOOKING_STATUS_LABEL, TRIAL_BOOKING_STATUS_TAG_TYPE } from '@/utils/constants'
import { handleRemoveError } from '@/utils/removable'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import BatchScheduleDialog from './BatchScheduleDialog.vue'
import TrialBookingSignInDialog from './TrialBookingSignInDialog.vue'
// 2026-06-21: 删 TrialAttachedDialog import (attached 跟班模式下线)

// 2026-06-20 调整:
//   - 状态机加 'considering' 顶级 status, 在 [已到店] 和 [已报名] 之间独立 tab
//   - 业务流: 待约 → 已约 → 已到店 → 考虑中 → 已报名/未报名
//                    ↓        ↓        ↓
//                已取消      (可退回)  (可被转化/被定夺)
//   - "已完成" 拆 2 个: 已报名(isEnrolled=true) / 未报名(isEnrolled=false or null)
//   - 每个 tab 配置:
//       - status / isEnrolled: 给后端 list 用 (除 'all' 外必填 status)
//       - dateFiltered: 看板视角的 tab 受日期 picker 约束; 流程视角不受
const TABS = [
  { value: 'awaiting_schedule', label: '待约', status: 'awaiting_schedule', dateFiltered: false },
  { value: 'scheduled', label: '已约', status: 'scheduled', dateFiltered: false },
  { value: 'arrived', label: '已到店', status: 'arrived', dateFiltered: false },
  // 2026-06-20: 考虑期独立 tab — 试听做完但家长没当场定夺, 谈单老师后续跟进
  { value: 'considering', label: '考虑中', status: 'considering', dateFiltered: false },
  { value: 'cancelled', label: '已取消', status: 'cancelled', dateFiltered: false },
  { value: 'completed_enrolled', label: '已报名', status: 'completed', isEnrolled: 'true', dateFiltered: true },
  { value: 'completed_not_enrolled', label: '未报名', status: 'completed', isEnrolled: 'false', dateFiltered: true },
  { value: 'all', label: '全部', dateFiltered: true }
]

const activeTab = ref('awaiting_schedule')
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const counts = reactive({
  awaiting_schedule: 0, scheduled: 0, arrived: 0, considering: 0, cancelled: 0,
  completed_enrolled: 0, completed_not_enrolled: 0,
  all: 0
})
const selectedRows = ref([])
const trialSubjectCategoryOptions = ref([])
// 2026-06-18: 年龄段下拉 — 业务上培训行业常用分段
//   - 学龄前/低年级 (3-5)
//   - 小学初级 (6-8)
//   - 小学高年级 (9-12)
//   - 中学 (13-18)
//   - 不限 (空)
const AGE_RANGE_OPTIONS = [
  { value: '3-5', label: '3-5 岁', min: 3, max: 5 },
  { value: '6-8', label: '6-8 岁', min: 6, max: 8 },
  { value: '9-12', label: '9-12 岁', min: 9, max: 12 },
  { value: '13-18', label: '13-18 岁', min: 13, max: 18 }
]
const filters = reactive({
  dateRange: defaultDateRange(),
  subject: null,        // ObjectId | null
  ageRange: null        // '3-5' / '6-8' / '9-12' / '13-18' | null
})
const pagination = reactive({ page: 1, pageSize: 20 })

/**
 * 默认时间范围 (2026-06-16 调整)
 *   - 老版: from = now - 1m, to = now  (只覆盖"过去 1 月")
 *   - 问题: 招生排课普遍排"未来" (下周、下月), 老 to=now 会把已约的预约全滤掉
 *   - 新版: from = now - 1m, to = now + 2m  (向后覆盖 2 个月)
 *   - 业务上试听预约几乎不会排 2 个月后, 这范围够用
 *   - 用 ISO 字符串 (value-format = 'YYYY-MM-DDTHH:mm:ss.SSS[Z]')
 */
function defaultDateRange() {
  const now = new Date()
  const from = new Date(now)
  from.setMonth(from.getMonth() - 1)
  const to = new Date(now)
  to.setMonth(to.getMonth() + 2)
  return [from.toISOString(), to.toISOString()]
}

const batchDialog = reactive({ visible: false })
const signInDialog = reactive({ visible: false, booking: null })
// 2026-06-21: 删 attachedDialog (attached 跟班模式下线)
// 2026-06-16: 改预约时间 / 再约一次 共用 dialog, mode 区分行为:
//   - 'time'      → scheduled 改时间 (调 rescheduleTime)
//   - 'cancelled' → cancelled 后再约一次 (调 rescheduleFromCancelled)
const rescheduleDialog = reactive({
  visible: false,
  mode: 'time',
  booking: null,
  submitting: false,
  form: { plannedStartTime: null, plannedEndTime: null, teacher: null }
})
const rescheduleDialogTitle = computed(() => {
  const name = rescheduleDialog.booking?.preStudent?.name || ''
  return rescheduleDialog.mode === 'cancelled'
    ? `再约一次 - ${name}`
    : `改预约时间 - ${name}`
})
const rescheduleFormRef = ref(null)
const teacherOptions = ref([])

const rescheduleRules = computed(() => ({
  plannedStartTime: [{ required: true, message: '请选择新开始时间', trigger: 'change' }],
  plannedEndTime: [
    {
      // 'cancelled' 模式下 plannedEndTime 是必填; 'time' 模式下可选 (保持原时长)
      required: rescheduleDialog.mode === 'cancelled',
      message: '请选择新结束时间',
      trigger: 'change'
    },
    {
      validator: (_, v, cb) => {
        if (v && rescheduleDialog.form.plannedStartTime && new Date(v) <= new Date(rescheduleDialog.form.plannedStartTime)) {
          return cb(new Error('结束时间必须晚于开始时间'))
        }
        cb()
      },
      trigger: 'change'
    }
  ],
  teacher: [
    {
      // 'cancelled' 模式下 teacher 是必填 (后端校验); 'time' 模式下可选
      required: rescheduleDialog.mode === 'cancelled',
      message: '请选择试听老师',
      trigger: 'change'
    }
  ]
}))

const authStore = useAuthStore()
const isPlatformAdmin = computed(() => !!authStore.user?.isPlatformAdmin)

onMounted(async () => {
  await Promise.all([loadAllCounts(), loadSubjectOptions()])
  load()
})

async function loadSubjectOptions() {
  try {
    // 2026-06-18: 改用 Category(model='Subject') 作为"试听科目类别"筛选项
    const r = await categoryApi.list({ model: 'Subject', pageSize: 200 })
    const items = r.data?.items || (Array.isArray(r.data) ? r.data : [])
    trialSubjectCategoryOptions.value = items
  } catch (e) {
    trialSubjectCategoryOptions.value = []
  }
}

/**
 * 2026-06-16: counts 也走 TABS 配置
 *   - 根据每个 tab 的 status / isEnrolled / dateFiltered 拼参数
 *   - counts 不带分页 (pageSize 越大越好, 但 1 已足够返回 total)
 *   - 拆"已报名/未报名"后, counts 桶也跟着分, 标签数字精准
 */
async function loadAllCounts() {
  for (const t of TABS) {
    try {
      const params = { pageSize: 1 }
      if (t.status) params.status = t.status
      if (t.isEnrolled) params.isEnrolled = t.isEnrolled
      if (t.dateFiltered) {
        params.from = filters.dateRange?.[0] || undefined
        params.to = filters.dateRange?.[1] || undefined
      }
      // 2026-06-18: counts 也受 subject + ageRange 影响 (顶部筛选联动)
      applyCommonFilters(params)
      const r = await trialBookingApi.list(params)
      counts[t.value] = r.data?.total || 0
    } catch (e) {
      counts[t.value] = 0
    }
  }
}

// 把顶部通用筛选 (subject + ageRange) 拼到后端 query 上
function applyCommonFilters(params) {
  if (filters.subject) params.subject = filters.subject
  if (filters.ageRange) {
    const r = AGE_RANGE_OPTIONS.find((x) => x.value === filters.ageRange)
    if (r) {
      params.ageMin = r.min
      params.ageMax = r.max
    }
  }
}

/**
 * 日期过滤 (2026-06-16 最终方案):
 *   - 用户决策: 看板视角的 tab (已报名/未报名/全部) 受顶部日期 picker 约束
 *   - 流程视角的 tab (待约/已约/已到店/已取消) 不受日期约束, 显示全集
 *   - 业务上:
 *       - 看板 tab = "这月完成几次/全部多少条", 必带日期
 *       - 流程 tab = "现在该跟进的", 不想被日期框住
 *   - 通用化: tab 配置上 `dateFiltered: true` 才受日期约束
 *     (避免再拆 tab 时白名单要同步改)
 */
async function load() {
  loading.value = true
  try {
    const params = {
      page: pagination.page,
      pageSize: pagination.pageSize
    }
    const tab = TABS.find((t) => t.value === activeTab.value)
    if (tab?.status) params.status = tab.status
    if (tab?.isEnrolled) params.isEnrolled = tab.isEnrolled
    if (tab?.dateFiltered) {
      params.from = filters.dateRange?.[0] || undefined
      params.to = filters.dateRange?.[1] || undefined
    }
    // 2026-06-18: 顶部通用筛选 — 科目 + 年龄段
    applyCommonFilters(params)
    const r = await trialBookingApi.list(params)
    const rawItems = r.data?.items || []
    // 2026-06-18: 前端二次排序 — 按科目名升序 → 按孩子年龄升序 (后端 cross-collection sort 需 aggregate,代价大)
    //   业务上"先按科目分桶,桶内按年龄从小学到中学"是销售跟单常用顺序
    rows.value = rawItems.slice().sort((a, b) => {
      const subA = (a.subject?.name || '').toString()
      const subB = (b.subject?.name || '').toString()
      if (subA !== subB) {
        // 空字符串排到最后 (未分配科目的 booking 不抢前位)
        if (!subA) return 1
        if (!subB) return -1
        return subA.localeCompare(subB, 'zh-Hans-CN')
      }
      const ageA = (a.preStudent?.age ?? Number.POSITIVE_INFINITY)
      const ageB = (b.preStudent?.age ?? Number.POSITIVE_INFINITY)
      return ageA - ageB
    })
    total.value = r.data?.total || 0
  } finally {
    loading.value = false
  }
}

function onTabChange() {
  pagination.page = 1
  selectedRows.value = []
  load()
}

function onSelectionChange(sel) {
  selectedRows.value = sel
}

function onReset() {
  filters.dateRange = defaultDateRange()
  filters.subject = null
  filters.ageRange = null
  pagination.page = 1
  load()
  loadAllCounts()
}

function openSignIn(row) {
  signInDialog.booking = row
  signInDialog.visible = true
}

function onSignInUpdated() {
  load()
  loadAllCounts()
}

async function onCancel(row) {
  const ok = await ElMessageBox.confirm(
    `确认取消该试听预约? (${row.preStudent?.name} - 第 ${row.attemptNo} 次)`,
    '取消预约',
    { type: 'warning' }
  ).catch(() => null)
  if (!ok) return
  try {
    await trialBookingApi.update(row._id, { status: 'cancelled' })
    ElMessage.success(`已取消 · 可在 [已取消] tab 找到该记录 (${row.preStudent?.name} - 第 ${row.attemptNo} 次)`)
    load()
    loadAllCounts()
  } catch (e) {
    // 错误已被拦截器弹
  }
}

/**
 * 退回未约 (scheduled → awaiting_schedule, 2026-06-16 新增)
 *   - 业务上: 已约过但销售决定要从"待约"池子重新挑老师/时间
 *   - 退回后该 booking 会出现在"待约" tab, 走批量排日程 / 跟班 重新选
 */
async function onRevertToUnscheduled(row) {
  const ok = await ElMessageBox.confirm(
    `确认把 ${row.preStudent?.name} (第 ${row.attemptNo} 次) 退回 [待约]?\n\n退回后该预约会从"已约" tab 移到"待约" tab, 可重新批量排日程或跟班。`,
    '退回未约',
    { type: 'warning' }
  ).catch(() => null)
  if (!ok) return
  try {
    await trialBookingApi.revertToUnscheduled(row._id)
    ElMessage.success(`已退回 [待约] · 可在 [待约] tab 找到该记录`)
    load()
    loadAllCounts()
  } catch (e) {
    // 错误已被拦截器弹
  }
}

/**
 * 打开改预约时间 dialog (mode='time', scheduled → scheduled)
 *   - 预填当前时间/老师
 *   - 拉老师列表 (排除"家长" 岗, 与 SignInDialog 保持一致)
 */
async function openRescheduleTime(row) {
  rescheduleDialog.mode = 'time'
  rescheduleDialog.booking = row
  rescheduleDialog.form.plannedStartTime = row.scheduledAt || null
  rescheduleDialog.form.plannedEndTime = null
  rescheduleDialog.form.teacher = row.teacher?._id || row.teacher || null
  rescheduleDialog.visible = true
  await loadTeacherOptions()
}

/**
 * 打开"再约一次" dialog (mode='cancelled', cancelled → 新 awaiting_schedule)
 *   - 预填: 不带 (新预约) — 用户从头选时间/老师
 *   - 旧 booking 留作审计, 后端创建 attemptNo=max+1 新记录
 */
async function openRescheduleFromCancelled(row) {
  rescheduleDialog.mode = 'cancelled'
  rescheduleDialog.booking = row
  rescheduleDialog.form.plannedStartTime = null
  rescheduleDialog.form.plannedEndTime = null
  rescheduleDialog.form.teacher = null
  rescheduleDialog.visible = true
  await loadTeacherOptions()
}

async function loadTeacherOptions() {
  if (teacherOptions.value.length > 0) return
  try {
    const r = await userApi.list({ pageSize: 200 })
    teacherOptions.value = (r.data?.items || [])
      .filter((u) => !(u.positions || []).some((p) => p.name === '家长'))
  } catch (e) {
    teacherOptions.value = []
  }
}

/**
 * 提交 (按 mode 走不同 API)
 *   - 'time':      rescheduleTime (改 scheduled 的时间/老师)
 *   - 'cancelled': rescheduleFromCancelled (新建一笔 attemptNo+1)
 */
async function confirmReschedule() {
  if (!rescheduleFormRef.value) return
  try {
    await rescheduleFormRef.value.validate()
  } catch (_) {
    return
  }
  const row = rescheduleDialog.booking
  if (!row) return
  rescheduleDialog.submitting = true
  try {
    if (rescheduleDialog.mode === 'time') {
      const payload = { plannedStartTime: rescheduleDialog.form.plannedStartTime }
      if (rescheduleDialog.form.plannedEndTime) payload.plannedEndTime = rescheduleDialog.form.plannedEndTime
      if (rescheduleDialog.form.teacher) payload.teacher = rescheduleDialog.form.teacher
      await trialBookingApi.rescheduleTime(row._id, payload)
      ElMessage.success(`已改预约时间`)
    } else {
      // 'cancelled' 模式 - 三个字段都是必填 (rules 校验过)
      await trialBookingApi.rescheduleFromCancelled(row._id, {
        plannedStartTime: rescheduleDialog.form.plannedStartTime,
        plannedEndTime: rescheduleDialog.form.plannedEndTime,
        teacher: rescheduleDialog.form.teacher
      })
      ElMessage.success(`已创建第 ${(row.attemptNo || 0) + 1} 次预约, 旧记录保留作审计`)
    }
    rescheduleDialog.visible = false
    load()
    loadAllCounts()
  } catch (e) {
    // 错误已被拦截器弹
  } finally {
    rescheduleDialog.submitting = false
  }
}

/**
 * 误操删除试听预约 (仅「已取消」状态可删)
 *   - 按钮 v-if: row.status === 'cancelled' && isPlatformAdmin (双重门控)
 *   - DestructiveConfirm: 预检 → 风险说明 → 输密码
 *   - 后端 requirePlatformPassword: 非超管 403 / 密码错 401 / 缺密码 400
 *   - 后端 assertUnused: 非 cancelled 状态挡板 422 + data.blockers
 */
async function onRemove(row, { password }) {
  try {
    await trialBookingApi.remove(row._id, { password })
    ElMessage.success(`已删除预约 (${row.preStudent?.name} - 第 ${row.attemptNo} 次)`)
    load()
    loadAllCounts()
  } catch (e) {
    await handleRemoveError(e, '无法删除试听预约', `预约 ${row.preStudent?.name} 第 ${row.attemptNo} 次`)
  }
}

function onBatchScheduled() {
  selectedRows.value = []
  load()
  loadAllCounts()
}

function formatTime(d) {
  if (!d) return '-'
  return new Date(d).toLocaleString('zh-CN')
}

/* ─── 计划时间动态着色 (2026-06-16 新增) ───
 * 业务需求:
 *   - 已过期: 红色 (已错过, 需立即跟进)
 *   - 今日:   橙色 (今天就要来, 重点关注)
 *   - 明日:   黄色 (明天来, 提前准备)
 *   - 7 天内: 绿色 (近期会来, 正常)
 *   - > 7 天: 黑色 (远期, 无紧迫性)
 *
 * 实现: 按 scheduledAt 与"今日 00:00" 的天数差分桶
 *   - days < 0          → 'overdue' (已过期, 红)
 *   - 0 <= days < 1     → 'today'   (今日, 橙)
 *   - 1 <= days < 2     → 'tomorrow' (明日, 黄)
 *   - 2 <= days <= 7    → 'within-week' (7 天内, 绿)
 *   - days > 7          → 'future' (远期, 黑)
 */
function daysFromToday(date) {
  if (!date) return null
  const target = new Date(date)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const targetDay = new Date(target)
  targetDay.setHours(0, 0, 0, 0)
  return Math.round((targetDay - today) / 86400000)
}

function timeClass(scheduledAt) {
  if (!scheduledAt) return ''
  const days = daysFromToday(scheduledAt)
  if (days === null) return ''
  if (days < 0) return 'time-overdue'        // 红 - 已过期
  if (days < 1) return 'time-today'          // 橙 - 今日
  if (days < 2) return 'time-tomorrow'       // 黄 - 明日
  if (days <= 7) return 'time-within-week'   // 绿 - 7 天内
  return 'time-future'                       // 黑 - 远期
}

function timeRelativeLabel(scheduledAt) {
  const days = daysFromToday(scheduledAt)
  if (days === null) return ''
  if (days < 0) return `${-days} 天前过期`
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days === 2) return '后天'
  if (days <= 7) return `${days} 天后`
  return `${days} 天后`
}

function rowClassName({ row }) {
  // 已过期 + 已约态: 整行加红底 (强烈提示)
  if (row.status === 'scheduled' && row.scheduledAt) {
    const days = daysFromToday(row.scheduledAt)
    if (days !== null && days < 0) return 'row-overdue'
  }
  return ''
}
</script>

<style scoped>
.trial-bookings-page {
  padding: 16px;
}
.filter-card {
  margin-bottom: 16px;
}
.filter-row {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.filter-row .spacer {
  flex: 1;
}
.counts {
  color: #606266;
  font-size: 13px;
}
.board-card {
  margin-bottom: 16px;
}
.pagination {
  margin-top: 16px;
  justify-content: flex-end;
}
.muted {
  color: #909399;
  font-size: 12px;
}

/* 2026-06-16: 改预约时间 / 再约一次 dialog 内提示 */
.mt {
  margin-top: 12px;
}

/* 2026-06-16: 备注列截长 + hover tooltip 看全文 */
.remark-cell {
  display: inline-block;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
  color: #606266;
  cursor: help;
}

/* 2026-06-16: 计划时间列动态着色 */
.time-cell {
  font-weight: 500;
}
.time-overdue {
  color: #f56c6c;       /* 红 - 已过期 */
}
.time-today {
  color: #e6a23c;       /* 橙 - 今日 */
}
.time-tomorrow {
  color: #d4b30b;       /* 黄 - 明日 (更深的黄避免与 warning tag 冲突) */
}
.time-within-week {
  color: #67c23a;       /* 绿 - 7 天内 */
}
.time-future {
  color: #303133;       /* 黑/默认 - 远期 */
}
.time-relative {
  font-size: 11px;
  color: #909399;
  margin-top: 2px;
}

/* 整行红底 (已过期的已约) */
:deep(.el-table__row.row-overdue) {
  background-color: #fef0f0 !important;
}
:deep(.el-table__row.row-overdue:hover > td) {
  background-color: #fde2e2 !important;
}
</style>
