<template>
  <div class="page report-page">
    <div class="report-header">
      <h2>课消与课表</h2>
      <div class="report-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <el-button :loading="loading" @click="load" type="primary" plain>
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>

    <p class="hint">本月数据。后端 60s 缓存，写考勤后自动失效。</p>

    <el-card class="board" shadow="never" v-loading="loading">
      <el-row :gutter="16">
        <el-col :xs="12" :sm="6"><KpiCard label="本月已消课" :value="d.lessons?.completed || 0" unit="节" accent="green" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="本月计划消" :value="d.lessons?.planned || 0" unit="节" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="课消率" :value="fmtPct(d.lessons?.consumptionRate)" accent="blue" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="出勤率" :value="fmtPct(d.attendance?.rates?.attendedRate)" accent="green" /></el-col>
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
          <el-table :data="(d.evaluation?.top || []).slice(0, 5)" size="small" stripe>
            <el-table-column prop="teacherName" label="老师" />
            <el-table-column prop="avgScore" label="均分" width="80" align="right">
              <template #default="{ row }">⭐ {{ row.avgScore }}</template>
            </el-table-column>
            <el-table-column prop="evaluationCount" label="评价数" width="90" align="right" />
          </el-table>
        </el-col>
        <el-col :xs="24" :md="12">
          <div class="chart-title">课评低分预警（Bottom 5）</div>
          <el-table :data="(d.evaluation?.bottom || []).slice(0, 5)" size="small" stripe>
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
      <el-table :data="d.instanceProgress || []" size="small" stripe>
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
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { reportApi } from '@/api/report'
import KpiCard from '@/components/KpiCard.vue'

const d = ref({})
const loading = ref(false)
const generatedAt = ref('')

function fmtPct(v) {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}
function statusLabel(s) {
  const map = { planning: '筹备', enrolling: '招生中', active: '进行中', closed: '已关闭', cancelled: '已取消' }
  return map[s] || s
}

const attendancePieRef = ref()
const teacherTopBarRef = ref()
const charts = []

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

const ATTENDANCE_COLOR = { completed: '#67c23a', checked_in: '#409eff', madeup: '#909399', no_show: '#f56c6c', leave: '#e6a23c' }
const ATTENDANCE_LABEL = { completed: '已消课', checked_in: '已签到', madeup: '已补课', no_show: '未到', leave: '请假' }

function renderAttendancePie() {
  const dist = d.value.attendance?.distribution || {}
  const data = Object.keys(ATTENDANCE_LABEL).map((k) => ({
    name: ATTENDANCE_LABEL[k],
    value: dist[k] || 0,
    itemStyle: { color: ATTENDANCE_COLOR[k] }
  })).filter((x) => x.value > 0)
  ensureChart(attendancePieRef.value, () => ({
    tooltip: { trigger: 'item', formatter: '{b}: {c} 节 ({d}%)' },
    legend: { bottom: 0, left: 'center' },
    series: [{ type: 'pie', radius: ['45%', '70%'], avoidLabelOverlap: true, label: { show: false }, data }]
  }))
}

function renderTeacherTopBar() {
  const list = (d.value.teacherTop || []).slice(0, 10)
  ensureChart(teacherTopBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 20, top: 10, bottom: 20 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: list.map((t) => t.teacherName).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: list.map((t) => t.lessonCount).reverse(), itemStyle: { color: '#409eff' } }]
  }))
}

async function load() {
  loading.value = true
  try {
    const res = await reportApi.lessonConsumption({ range: 'month' })
    d.value = res.data?.data || {}
    generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    await nextTick()
    renderAttendancePie()
    renderTeacherTopBar()
  } finally {
    loading.value = false
  }
}

watch(d, () => {
  nextTick(() => {
    renderAttendancePie()
    renderTeacherTopBar()
  })
}, { deep: true })

function onResize() { for (const c of charts) c.resize() }
window.addEventListener('resize', onResize)
onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  for (const c of charts) c.dispose()
})

onMounted(load)
</script>

<style scoped>
.report-header { display: flex; justify-content: space-between; align-items: center; }
.report-header h2 { margin: 0; }
.report-header-right { display: flex; align-items: center; gap: 12px; }
.generated-at { color: #909399; font-size: 13px; }
.hint { color: #606266; font-size: 13px; margin: 4px 0 16px; }
.board { margin-bottom: 16px; }
.chart-title { font-size: 13px; color: #606266; margin-bottom: 6px; font-weight: 500; }
.chart { width: 100%; height: 280px; }
.muted { color: #909399; font-size: 12px; }
.cell-strong { font-weight: 600; }
.cell-danger { color: #f56c6c; font-weight: 600; }
</style>
