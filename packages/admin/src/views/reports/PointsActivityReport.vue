<template>
  <div class="page report-page">
    <ReportBoard
      v-model="currentRange"
      title="积分与家长活跃"
      icon="⭐"
      hint="流水全量统计；活跃家长 = 近 N 天有过积分流水的学员数（去重）。积分总览与时间窗无关（累计型指标）。"
      :loading="loading"
      :generated-at="generatedAt"
      @range-change="reloadByRange"
    >
      <template #kpis>
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
      </template>

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
    </ReportBoard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useReportApi } from '@/composables/useReportApi'
import { useECharts } from '@/composables/useECharts'
import KpiCard from '@/components/KpiCard.vue'
import ReportBoard from '@/components/report/ReportBoard.vue'

const currentRange = ref({ range: 'month', from: '', to: '' })
const { data: d, loading, generatedAt, load } = useReportApi('pointsActivity')

const totalTxCount = computed(() => (d.value.points?.byType || []).reduce((s, x) => s + (x.count || 0), 0))

const petLevelBarRef = ref()

useECharts(
  () => d.value,
  { petLevelBarRef },
  {
    petLevelBarRef: () => {
      const list = d.value.petLevelDistribution?.list || []
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 40, right: 20, top: 10, bottom: 30 },
        xAxis: { type: 'category', data: list.map((p) => `Lv.${p.level}`) },
        yAxis: { type: 'value' },
        series: [{ type: 'bar', data: list.map((p) => p.count), itemStyle: { color: '#a855f7' } }]
      }
    }
  }
)

async function reloadByRange(next) {
  currentRange.value = { ...next }
  await load(next)
}

onMounted(() => reloadByRange(currentRange.value))
</script>

<style scoped>
.report-page { padding: 16px; }
.chart-title { font-size: 13px; color: #606266; margin-bottom: 6px; font-weight: 500; }
.chart { width: 100%; height: 280px; }
.cell-positive { color: #67c23a; }
.cell-negative { color: #f56c6c; }
</style>
