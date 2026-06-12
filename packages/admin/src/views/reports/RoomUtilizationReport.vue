<template>
  <div class="page report-page">
    <div class="report-header">
      <h2>教室与排课利用率</h2>
      <div class="report-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <el-button :loading="loading" @click="load" type="primary" plain>
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>

    <p class="hint">本月 + 近 30 天热力。营业时段口径 10:00-22:00 (12h/天 × 30d)。</p>

    <el-card class="board" shadow="never" v-loading="loading">
      <el-row :gutter="16">
        <el-col :xs="12" :sm="6"><KpiCard label="排课冲突" :value="d.conflicts?.total || 0" unit="处" :extra="`老师 ${d.conflicts?.teacherCount || 0} / 教室 ${d.conflicts?.roomCount || 0}`" accent="red" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="峰值时段" :value="d.peakHour?.label || '—'" :extra="`${d.peakHour?.count || 0} 节`" accent="blue" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="开班平均满班率" :value="fmtPct(d.instanceFillRate?.avg)" accent="green" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="在跟开班" :value="d.instanceFillRate?.total || 0" unit="个" /></el-col>
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
      <el-table :data="d.instanceFillRate?.list || []" size="small" stripe>
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

      <div v-if="d.conflicts?.samples?.length" class="conflicts-block">
        <div class="chart-title" style="margin-top: 16px">本月排课冲突示例（最多展示 20 条）</div>
        <el-table :data="d.conflicts.samples" size="small" stripe>
          <el-table-column label="类型" width="100">
            <template #default="{ row }">
              <el-tag :type="row.type === 'teacher' ? 'danger' : 'warning'" size="small">
                {{ row.type === 'teacher' ? '老师冲突' : '教室冲突' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="A 课次" min-width="240">
            <template #default="{ row }">{{ formatDT(row.lessonA.start) }} ~ {{ formatDT(row.lessonA.end) }}</template>
          </el-table-column>
          <el-table-column label="B 课次" min-width="240">
            <template #default="{ row }">{{ formatDT(row.lessonB.start) }} ~ {{ formatDT(row.lessonB.end) }}</template>
          </el-table-column>
        </el-table>
        <p class="muted" style="margin-top: 6px">提示：完整冲突请到「排课」页按老师/教室筛选查看。</p>
      </div>
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
function formatDT(s) {
  if (!s) return '—'
  const dt = new Date(s)
  if (isNaN(dt.getTime())) return '—'
  return dt.toLocaleString('zh-CN', { hour12: false })
}

const peakHourBarRef = ref()
const roomOccBarRef = ref()
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

function renderPeakHourBar() {
  const list = d.value.peakHour?.hourly || []
  ensureChart(peakHourBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: list.map((h) => String(h.hour).padStart(2, '0') + ':00') },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: list.map((h) => h.count), itemStyle: { color: '#67c23a' } }]
  }))
}

function renderRoomOccBar() {
  const list = (d.value.roomOccupancy || []).slice(0, 12)
  ensureChart(roomOccBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (p) => `${p[0].name}<br/>占用率 ${p[0].value}%` },
    grid: { left: 100, right: 40, top: 10, bottom: 20 },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: list.map((r) => r.roomName).reverse(), axisLabel: { fontSize: 11 } },
    series: [{ type: 'bar', data: list.map((r) => r.occupancyRate).reverse(), itemStyle: { color: '#e6a23c' } }]
  }))
}

async function load() {
  loading.value = true
  try {
    const res = await reportApi.roomUtilization({ range: 'month' })
    d.value = res.data?.data || {}
    generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    await nextTick()
    renderPeakHourBar()
    renderRoomOccBar()
  } finally {
    loading.value = false
  }
}

watch(d, () => {
  nextTick(() => {
    renderPeakHourBar()
    renderRoomOccBar()
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
.conflicts-block { margin-top: 8px; }
</style>
