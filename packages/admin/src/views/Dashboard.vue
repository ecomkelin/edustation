<template>
  <div class="page dashboard">
    <div class="dash-header">
      <h2>经营看板</h2>
      <div class="dash-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <el-button :loading="loading" @click="refresh" type="primary" plain>
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>

    <p class="hint">
      看板按当前机构（<b>{{ orgName }}</b>）自动隔离；权限不足的看板会显示「无权限访问」。
      待开发（依赖新字段/新模型）的指标见 <code>CLAUDE.md §16.3</code>。
    </p>

    <!-- ───── 1. 经营总览 ───── -->
    <el-card class="board" shadow="hover">
      <template #header>
        <div class="board-title">📊 经营总览</div>
      </template>
      <div v-if="perm.orderRead">
        <el-row :gutter="16" v-loading="loadingMap.overview">
          <el-col :xs="12" :sm="6"><KpiCard label="今日营收" :value="fmtMoney(overview.revenue?.today)" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本月营收" :value="fmtMoney(overview.revenue?.month)" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="待支付金额" :value="fmtMoney(overview.orders?.pendingAmount)" :extra="`${overview.orders?.pendingCount || 0} 笔`" accent="orange" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本月已退费" :value="fmtMoney(overview.refund?.monthAmount)" :extra="`${overview.refund?.monthCount || 0} 笔`" accent="red" /></el-col>
        </el-row>
        <el-row :gutter="16" style="margin-top: 12px">
          <el-col :xs="12" :sm="6"><KpiCard label="在读学员" :value="overview.students?.active || 0" unit="人" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本月新增" :value="overview.students?.newMonth || 0" unit="人" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本月流失" :value="overview.students?.droppedMonth || 0" unit="人" accent="red" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="待续费提醒" :value="overview.pendingRenewal || 0" unit="人" accent="orange" /></el-col>
        </el-row>
        <el-row :gutter="16" style="margin-top: 12px">
          <el-col :xs="12" :sm="6"><KpiCard label="活跃课包" :value="overview.studentProducts?.activeCount || 0" unit="份" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="总剩余课时" :value="overview.studentProducts?.totalRemainingLessons || 0" unit="节" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="7 日内过期" :value="overview.studentProducts?.expiringSoon7d || 0" unit="份" accent="orange" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="7 日出勤率" :value="fmtPct(overview.attendance?.rate)" :extra="`${overview.attendance?.attended || 0} / ${overview.attendance?.total || 0}`" accent="green" /></el-col>
        </el-row>
      </div>
      <NoPermission v-else module="order.read" />
    </el-card>

    <!-- ───── 2. 课消与课表 ───── -->
    <el-card class="board" shadow="hover">
      <template #header><div class="board-title">📚 课消与课表</div></template>
      <div v-if="perm.lessonScheduleRead">
        <el-row :gutter="16" v-loading="loadingMap.lessonConsumption">
          <el-col :xs="12" :sm="6"><KpiCard label="本月已消课" :value="lesson.lessons?.completed || 0" unit="节" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本月计划消" :value="lesson.lessons?.planned || 0" unit="节" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="课消率" :value="fmtPct(lesson.lessons?.consumptionRate)" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="出勤率" :value="fmtPct(lesson.attendance?.rates?.attendedRate)" accent="green" /></el-col>
        </el-row>

        <el-row :gutter="16" style="margin-top: 16px">
          <el-col :xs="24" :md="10">
            <div class="chart-title">本月考勤分布</div>
            <div ref="attendancePieRef" class="chart" />
          </el-col>
          <el-col :xs="24" :md="14">
            <div class="chart-title">老师产能 Top 10（按本月已排课时）</div>
            <div ref="teacherTopBarRef" class="chart" />
          </el-col>
        </el-row>

        <el-row :gutter="16" style="margin-top: 16px">
          <el-col :xs="24" :md="12">
            <div class="chart-title">课评均分 Top 5</div>
            <el-table :data="(lesson.evaluation?.top || []).slice(0, 5)" size="small" stripe>
              <el-table-column prop="teacherName" label="老师" />
              <el-table-column prop="avgScore" label="均分" width="80" align="right">
                <template #default="{ row }">⭐ {{ row.avgScore }}</template>
              </el-table-column>
              <el-table-column prop="evaluationCount" label="评价数" width="90" align="right" />
            </el-table>
          </el-col>
          <el-col :xs="24" :md="12">
            <div class="chart-title">课评低分预警（Bottom 5）</div>
            <el-table :data="(lesson.evaluation?.bottom || []).slice(0, 5)" size="small" stripe>
              <el-table-column prop="teacherName" label="老师" />
              <el-table-column prop="avgScore" label="均分" width="80" align="right">
                <template #default="{ row }">
                  <span :class="row.avgScore <= 3 ? 'cell-danger' : ''">⭐ {{ row.avgScore }}</span>
                </template>
              </el-table-column>
              <el-table-column prop="evaluationCount" label="评价数" width="90" align="right" />
            </el-table>
          </el-col>
        </el-row>

        <div class="chart-title" style="margin-top: 16px">各开班消课进度（Top 10 活跃）</div>
        <el-table :data="lesson.instanceProgress || []" size="small" stripe>
          <el-table-column label="课程 / 开班" min-width="220">
            <template #default="{ row }">
              <div class="cell-strong">{{ row.courseName }}</div>
              <div class="muted">{{ row.instanceName }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="已消/计划" width="120" align="right">
            <template #default="{ row }">{{ row.completed }} / {{ row.totalPlanned || '—' }}</template>
          </el-table-column>
          <el-table-column label="进度" min-width="200">
            <template #default="{ row }">
              <el-progress :percentage="row.progress || 0" :stroke-width="10" />
            </template>
          </el-table-column>
        </el-table>
      </div>
      <NoPermission v-else module="lessonSchedule.read" />
    </el-card>

    <!-- ───── 3. 教室与排课利用率 ───── -->
    <el-card class="board" shadow="hover">
      <template #header><div class="board-title">🏫 教室与排课利用率</div></template>
      <div v-if="perm.lessonScheduleRead">
        <el-row :gutter="16" v-loading="loadingMap.roomUtilization">
          <el-col :xs="12" :sm="6"><KpiCard label="排课冲突" :value="room.conflicts?.total || 0" unit="处" :extra="`老师 ${room.conflicts?.teacherCount || 0} / 教室 ${room.conflicts?.roomCount || 0}`" accent="red" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="峰值时段" :value="room.peakHour?.label || '—'" :extra="`${room.peakHour?.count || 0} 节`" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="开班平均满班率" :value="fmtPct(room.instanceFillRate?.avg)" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="在跟开班" :value="room.instanceFillRate?.total || 0" unit="个" /></el-col>
        </el-row>

        <el-row :gutter="16" style="margin-top: 16px">
          <el-col :xs="24" :md="14">
            <div class="chart-title">每日峰值时段（近 30 天，按小时分桶）</div>
            <div ref="peakHourBarRef" class="chart" />
          </el-col>
          <el-col :xs="24" :md="10">
            <div class="chart-title">教室占用率（本月）</div>
            <div ref="roomOccBarRef" class="chart" />
          </el-col>
        </el-row>

        <div class="chart-title" style="margin-top: 16px">开班满班率</div>
        <el-table :data="room.instanceFillRate?.list || []" size="small" stripe>
          <el-table-column label="课程 / 开班" min-width="220">
            <template #default="{ row }">
              <div class="cell-strong">{{ row.courseName }}</div>
              <div class="muted">{{ row.instanceName }}</div>
            </template>
          </el-table-column>
          <el-table-column prop="status" label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">{{ statusLabel(row.status) }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="已报/上限" width="110" align="right">
            <template #default="{ row }">{{ row.enrolled }} / {{ row.maxStudents }}</template>
          </el-table-column>
          <el-table-column label="满班率" min-width="200">
            <template #default="{ row }">
              <el-progress :percentage="row.fillRate" :stroke-width="10" :status="row.fillRate >= 100 ? 'success' : ''" />
            </template>
          </el-table-column>
        </el-table>
      </div>
      <NoPermission v-else module="lessonSchedule.read" />
    </el-card>

    <!-- ───── 4. 老师产能与绩效 ───── -->
    <el-card class="board" shadow="hover">
      <template #header><div class="board-title">👨‍🏫 老师产能与绩效（本月）</div></template>
      <div v-if="perm.lessonScheduleRead">
        <el-row :gutter="16" v-loading="loadingMap.teacherProductivity">
          <el-col :xs="12" :sm="6"><KpiCard label="老师数" :value="teacher.summary?.teacherCount || 0" unit="人" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="人均月课时" :value="teacher.summary?.avgMonthlyLessons || 0" unit="节" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="人均周课时" :value="teacher.summary?.avgWeeklyLessons || 0" unit="节" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="平均消课率" :value="fmtPct(teacher.summary?.avgCompletionRate)" accent="green" /></el-col>
        </el-row>

        <div class="chart-title" style="margin-top: 16px">老师明细</div>
        <el-table :data="teacher.teachers || []" size="small" stripe>
          <el-table-column prop="teacherName" label="老师" min-width="120" />
          <el-table-column prop="weeklyLessons" label="周课时" width="80" align="right" />
          <el-table-column prop="monthlyLessons" label="月课时" width="80" align="right" />
          <el-table-column prop="classCount" label="班级数" width="80" align="right" />
          <el-table-column prop="studentCount" label="学生数" width="80" align="right" />
          <el-table-column prop="monthlyDensity" label="日均课时" width="90" align="right" />
          <el-table-column label="课评均分" width="120" align="right">
            <template #default="{ row }">
              <span v-if="row.evaluationAvg != null">⭐ {{ row.evaluationAvg }} <span class="muted">({{ row.evaluationCount }})</span></span>
              <span v-else class="muted">—</span>
            </template>
          </el-table-column>
          <el-table-column label="消课率" width="100" align="right">
            <template #default="{ row }">
              <span :class="row.completionRate < 70 ? 'cell-danger' : ''">{{ fmtPct(row.completionRate) }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
      <NoPermission v-else module="lessonSchedule.read" />
    </el-card>

    <!-- ───── 5. 积分与家长活跃 ───── -->
    <el-card class="board" shadow="hover">
      <template #header><div class="board-title">🎮 积分与家长活跃</div></template>
      <div v-if="perm.studentRead">
        <el-row :gutter="16" v-loading="loadingMap.pointsActivity">
          <el-col :xs="12" :sm="6"><KpiCard label="总入账积分" :value="points.points?.totalInflow || 0" unit="分" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="总出账积分" :value="Math.abs(points.points?.totalOutflow || 0)" unit="分" accent="orange" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="当前总余额" :value="points.points?.totalBalance || 0" unit="分" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="宠物总数" :value="points.petLevelDistribution?.total || 0" unit="只" /></el-col>
        </el-row>
        <el-row :gutter="16" style="margin-top: 12px">
          <el-col :xs="12" :sm="8"><KpiCard label="7 日活跃家长" :value="points.activeParents?.last7d || 0" unit="人" accent="blue" /></el-col>
          <el-col :xs="12" :sm="8"><KpiCard label="30 日活跃家长" :value="points.activeParents?.last30d || 0" unit="人" accent="blue" /></el-col>
          <el-col :xs="12" :sm="8"><KpiCard label="积分流水笔数" :value="totalTxCount" unit="笔" /></el-col>
        </el-row>

        <el-row :gutter="16" style="margin-top: 16px">
          <el-col :xs="24" :md="12">
            <div class="chart-title">宠物等级分布</div>
            <div ref="petLevelBarRef" class="chart" />
          </el-col>
          <el-col :xs="24" :md="12">
            <div class="chart-title">积分分布（按 type）</div>
            <el-table :data="points.points?.byType || []" size="small" stripe>
              <el-table-column prop="type" label="类型" />
              <el-table-column prop="count" label="笔数" width="100" align="right" />
              <el-table-column label="入账" width="120" align="right">
                <template #default="{ row }"><span class="cell-positive">+{{ row.inflow || 0 }}</span></template>
              </el-table-column>
              <el-table-column label="出账" width="120" align="right">
                <template #default="{ row }"><span class="cell-negative">{{ row.outflow || 0 }}</span></template>
              </el-table-column>
            </el-table>
          </el-col>
        </el-row>
      </div>
      <NoPermission v-else module="student.read" />
    </el-card>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { Refresh } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { reportApi } from '@/api/report'
import KpiCard from '@/components/KpiCard.vue'
import NoPermission from '@/components/NoPermission.vue'

const auth = useAuthStore()
const { user, currentOrgId } = storeToRefs(auth)
const orgName = computed(() => auth.currentOrg?.name || currentOrgId.value || '—')

// ---- 权限判断（前端按 store 中的 permissions 简单判断） ----
const perm = reactive({
  orderRead: computed(() => hasPerm('order.read')),
  lessonScheduleRead: computed(() => hasPerm('lessonSchedule.read')),
  studentRead: computed(() => hasPerm('student.read'))
})
function hasPerm(code) {
  // auth store 通常维护了 currentUser.permissions；fallback 给 true（由后端兜底）
  const perms = user.value?.permissions || []
  if (perms.length === 0) return true // 没有权限列表时先放行，后端 requirePermission 兜底
  return perms.includes(code)
}

// ---- 各看板数据 ----
const overview = ref({})
const lesson = ref({})
const room = ref({})
const teacher = ref({})
const points = ref({})

const loading = ref(false)
const loadingMap = reactive({ overview: false, lessonConsumption: false, roomUtilization: false, teacherProductivity: false, pointsActivity: false })
const generatedAt = ref('')
const totalTxCount = computed(() => (points.value.points?.byType || []).reduce((s, x) => s + (x.count || 0), 0))

// ---- 格式化 ----
function fmtMoney(v) {
  if (v == null) return '¥ 0'
  return '¥ ' + Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(v) {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}
function statusLabel(s) {
  const map = { planning: '筹备', enrolling: '招生中', active: '进行中', closed: '已关闭', cancelled: '已取消' }
  return map[s] || s
}

// ---- 数据拉取 ----
async function refresh() {
  if (!currentOrgId.value) return
  loading.value = true
  await Promise.allSettled([
    loadOne('overview', () => reportApi.overview()),
    loadOne('lessonConsumption', () => reportApi.lessonConsumption()),
    loadOne('roomUtilization', () => reportApi.roomUtilization()),
    loadOne('teacherProductivity', () => reportApi.teacherProductivity()),
    loadOne('pointsActivity', () => reportApi.pointsActivity())
  ])
  loading.value = false
  generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  await nextTick()
  renderAllCharts()
}

async function loadOne(key, fn) {
  loadingMap[key] = true
  try {
    const res = await fn()
    const data = res.data?.data || {}
    if (key === 'overview') overview.value = data
    else if (key === 'lessonConsumption') lesson.value = data
    else if (key === 'roomUtilization') room.value = data
    else if (key === 'teacherProductivity') teacher.value = data
    else if (key === 'pointsActivity') points.value = data
  } catch (e) {
    console.warn(`[dashboard] ${key} load failed`, e)
  } finally {
    loadingMap[key] = false
  }
}

// ---- 图表 ----
const attendancePieRef = ref()
const teacherTopBarRef = ref()
const peakHourBarRef = ref()
const roomOccBarRef = ref()
const petLevelBarRef = ref()
const charts = []

function renderAllCharts() {
  renderAttendancePie()
  renderTeacherTopBar()
  renderPeakHourBar()
  renderRoomOccBar()
  renderPetLevelBar()
}

function ensureChart(refEl, getOption) {
  if (!refEl) return null
  let c = echarts.getInstanceByDom(refEl)
  if (!c) {
    c = echarts.init(refEl)
    charts.push(c)
  }
  c.setOption(getOption(), true)
  return c
}

const ATTENDANCE_COLOR = {
  completed: '#67c23a',
  checked_in: '#409eff',
  madeup: '#909399',
  no_show: '#f56c6c',
  leave: '#e6a23c'
}
const ATTENDANCE_LABEL = {
  completed: '已消课',
  checked_in: '已签到',
  madeup: '已补课',
  no_show: '未到',
  leave: '请假'
}

function renderAttendancePie() {
  const dist = lesson.value.attendance?.distribution || {}
  const data = Object.keys(ATTENDANCE_LABEL).map((k) => ({
    name: ATTENDANCE_LABEL[k],
    value: dist[k] || 0,
    itemStyle: { color: ATTENDANCE_COLOR[k] }
  })).filter((d) => d.value > 0)
  ensureChart(attendancePieRef.value, () => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} 节 ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [{ type: 'pie', radius: ['45%', '70%'], avoidLabelOverlap: true, label: { show: false }, data }]
  }))
}

function renderTeacherTopBar() {
  const list = (lesson.value.teacherTop || []).slice(0, 10)
  ensureChart(teacherTopBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 20, top: 10, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: list.map((t) => t.teacherName).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: list.map((t) => t.lessonCount).reverse(), itemStyle: { color: '#409eff' } }]
  }))
}

function renderPeakHourBar() {
  const list = room.value.peakHour?.hourly || []
  ensureChart(peakHourBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: list.map((h) => String(h.hour).padStart(2, '0') + ':00') },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: list.map((h) => h.count), itemStyle: { color: '#67c23a' } }]
  }))
}

function renderRoomOccBar() {
  const list = (room.value.roomOccupancy || []).slice(0, 12)
  ensureChart(roomOccBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}<br/>占用率 ${p[0].value}%` },
    grid: { left: 100, right: 40, top: 10, bottom: 20 },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: list.map((r) => r.roomName).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: list.map((r) => r.occupancyRate).reverse(), itemStyle: { color: '#e6a23c' } }]
  }))
}

function renderPetLevelBar() {
  const list = points.value.petLevelDistribution?.list || []
  ensureChart(petLevelBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: list.map((p) => `Lv.${p.level}`) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: list.map((p) => p.count), itemStyle: { color: '#a855f7' } }]
  }))
}

// 数据变化时重渲染对应图表
watch(lesson, () => nextTick(renderAttendancePie), { deep: true })
watch(lesson, () => nextTick(renderTeacherTopBar), { deep: true })
watch(room, () => nextTick(renderPeakHourBar), { deep: true })
watch(room, () => nextTick(renderRoomOccBar), { deep: true })
watch(points, () => nextTick(renderPetLevelBar), { deep: true })

// 窗口 resize 时自适应
function onResize() {
  for (const c of charts) c.resize()
}
window.addEventListener('resize', onResize)

onMounted(refresh)
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  for (const c of charts) c.dispose()
})
</script>

<style lang="scss" scoped>
.dashboard {
  .dash-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    h2 { margin: 0; }
    .dash-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      .generated-at { color: #909399; font-size: 13px; }
    }
  }
  .hint { color: #606266; font-size: 13px; margin: 4px 0 16px; }
  .board { margin-bottom: 16px; }
  .board-title { font-weight: 600; font-size: 15px; }
  .chart-title {
    font-size: 13px;
    color: #606266;
    margin-bottom: 6px;
    font-weight: 500;
  }
  .chart {
    width: 100%;
    height: 280px;
  }
  .muted { color: #909399; font-size: 12px; }
  .cell-strong { font-weight: 600; }
  .cell-danger { color: #f56c6c; font-weight: 600; }
  .cell-positive { color: #67c23a; }
  .cell-negative { color: #f56c6c; }
}
</style>
