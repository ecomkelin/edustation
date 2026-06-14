<template>
  <div class="trial-bookings-page">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <div class="filter-row">
        <el-select v-model="filters.status" placeholder="状态" clearable style="width: 130px" @change="load">
          <el-option
            v-for="(label, value) in TRIAL_BOOKING_STATUS_LABEL"
            :key="value"
            :label="label"
            :value="value"
          />
        </el-select>
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
          批量排课
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
            @selection-change="onSelectionChange"
          >
            <el-table-column v-if="tab.value === 'awaiting_schedule'" type="selection" width="50" />
            <el-table-column label="孩子姓名" min-width="100">
              <template #default="{ row }">{{ row.preStudent?.name || '-' }}</template>
            </el-table-column>
            <el-table-column label="联系电话" width="130">
              <template #default="{ row }">{{ row.preStudent?.phone || '-' }}</template>
            </el-table-column>
            <el-table-column label="第几次" width="80">
              <template #default="{ row }">
                <el-tag v-if="row.attemptNo > 1" size="small" type="info">第 {{ row.attemptNo }} 次</el-tag>
                <span v-else>1</span>
              </template>
            </el-table-column>
            <el-table-column label="试听科目" min-width="100">
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
            <el-table-column label="计划时间" width="160">
              <template #default="{ row }">{{ formatTime(row.scheduledAt) }}</template>
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
            <el-table-column label="操作" width="220" fixed="right">
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
                <el-button
                  v-if="row.status === 'no_show'"
                  size="small"
                  type="warning"
                  link
                  @click="onReschedule(row)"
                >再约一次</el-button>
                <el-button
                  v-if="row.status === 'awaiting_schedule'"
                  size="small"
                  link
                  @click="onAttached(row)"
                >跟班</el-button>
                <el-button
                  v-if="['awaiting_schedule', 'scheduled', 'no_show'].includes(row.status)"
                  size="small"
                  type="danger"
                  link
                  @click="onCancel(row)"
                >取消</el-button>
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

    <!-- 批量排课 dialog -->
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
      @reschedule="onReschedule"
    />

    <!-- 跟班试听 dialog -->
    <TrialAttachedDialog
      v-model:visible="attachedDialog.visible"
      :booking="attachedDialog.booking"
      @scheduled="load"
    />
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import { trialBookingApi } from '@/api/trialBooking'
import { TRIAL_BOOKING_STATUS_LABEL, TRIAL_BOOKING_STATUS_TAG_TYPE } from '@/utils/constants'
import BatchScheduleDialog from './BatchScheduleDialog.vue'
import TrialBookingSignInDialog from './TrialBookingSignInDialog.vue'
import TrialAttachedDialog from './TrialAttachedDialog.vue'

const TABS = [
  { value: 'awaiting_schedule', label: '待约' },
  { value: 'scheduled', label: '已约' },
  { value: 'arrived', label: '已到店' },
  { value: 'completed', label: '已完成' },
  { value: 'no_show', label: '未到' }
]

const activeTab = ref('awaiting_schedule')
const loading = ref(false)
const rows = ref([])
const total = ref(0)
const counts = reactive({
  awaiting_schedule: 0, scheduled: 0, arrived: 0, completed: 0, no_show: 0
})
const selectedRows = ref([])
const filters = reactive({ status: '', dateRange: null })
const pagination = reactive({ page: 1, pageSize: 20 })

const batchDialog = reactive({ visible: false })
const signInDialog = reactive({ visible: false, booking: null })
const attachedDialog = reactive({ visible: false, booking: null })

onMounted(async () => {
  await loadAllCounts()
  load()
})

async function loadAllCounts() {
  // 拉 5 个状态的数量 (看板 tab 徽标用)
  for (const t of TABS) {
    try {
      const r = await trialBookingApi.list({ status: t.value, pageSize: 1 })
      counts[t.value] = r.data?.total || 0
    } catch (e) {
      counts[t.value] = 0
    }
  }
}

async function load() {
  loading.value = true
  try {
    // 如果用户在 "待约" 之外的 tab, 用该 tab 的 status 过滤; 否则用全局 status 过滤
    const status = activeTab.value
    const r = await trialBookingApi.list({
      status,
      from: filters.dateRange?.[0] || undefined,
      to: filters.dateRange?.[1] || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize
    })
    rows.value = r.data?.items || []
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
  filters.status = ''
  filters.dateRange = null
  pagination.page = 1
  load()
}

function openSignIn(row) {
  signInDialog.booking = row
  signInDialog.visible = true
}

function onSignInUpdated() {
  load()
  loadAllCounts()
}

function onReschedule(row) {
  // 用单笔 attached 路径
  signInDialog.booking = row
  signInDialog.visible = true
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
    ElMessage.success('已取消')
    load()
    loadAllCounts()
  } catch (e) {
    // 错误已被拦截器弹
  }
}

function onAttached(row) {
  attachedDialog.booking = row
  attachedDialog.visible = true
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
</style>
