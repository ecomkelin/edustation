<template>
  <div class="page report-page">
    <div class="report-header">
      <h2>积分与家长活跃</h2>
      <div class="report-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <el-button :loading="loading" @click="load" type="primary" plain>
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>

    <p class="hint">流水全量统计；活跃家长 = 近 N 天有过积分流水的学员数（去重）。</p>

    <el-card class="board" shadow="never" v-loading="loading">
      <el-row :gutter="16">
        <el-col :xs="12" :sm="6"><KpiCard label="总入账积分" :value="d.points?.totalInflow || 0" unit="分" accent="green" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="总出账积分" :value="Math.abs(d.points?.totalOutflow || 0)" unit="分" accent="orange" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="当前总余额" :value="d.points?.totalBalance || 0" unit="分" accent="blue" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="宠物总数" :value="d.petLevelDistribution?.total || 0" unit="只" /></el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top: 12px">
        <el-col :xs="12" :sm="8"><KpiCard label="7 日活跃家长" :value="d.activeParents?.last7d || 0" unit="人" accent="blue" /></el-col>
        <el-col :xs="12" :sm="8"><KpiCard label="30 日活跃家长" :value="d.activeParents?.last30d || 0" unit="人" accent="blue" /></el-col>
        <el-col :xs="12" :sm="8"><KpiCard label="积分流水笔数" :value="totalTxCount" unit="笔" /></el-col>
      </el-row>

      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :xs="24" :md="12">
          <div class="chart-title">宠物等级分布</div>
          <div ref="petLevelBarRef" class="chart" />
        </el-col>
        <el-col :xs="24" :md="12">
          <div class="chart-title">积分分布（按 type）</div>
          <el-table :data="d.points?.byType || []" size="small" stripe>
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
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick, watch } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { reportApi } from '@/api/report'
import KpiCard from '@/components/KpiCard.vue'

const d = ref({})
const loading = ref(false)
const generatedAt = ref('')
const totalTxCount = computed(() => (d.value.points?.byType || []).reduce((s, x) => s + (x.count || 0), 0))

const petLevelBarRef = ref()
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

function renderPetLevelBar() {
  const list = d.value.petLevelDistribution?.list || []
  ensureChart(petLevelBarRef.value, () => ({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 40, right: 20, top: 10, bottom: 30 },
    xAxis: { type: 'category', data: list.map((p) => `Lv.${p.level}`) },
    yAxis: { type: 'value' },
    series: [{ type: 'bar', data: list.map((p) => p.count), itemStyle: { color: '#a855f7' } }]
  }))
}

async function load() {
  loading.value = true
  try {
    const res = await reportApi.pointsActivity({ range: 'month' })
    d.value = res.data?.data || {}
    generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    await nextTick()
    renderPetLevelBar()
  } finally {
    loading.value = false
  }
}

watch(d, () => nextTick(renderPetLevelBar), { deep: true })

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
.cell-positive { color: #67c23a; }
.cell-negative { color: #f56c6c; }
</style>
