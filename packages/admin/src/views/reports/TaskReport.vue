<template>
  <div class="page report-page">
    <ReportBoard
      v-model="currentRange"
      title="任务概览"
      icon="📋"
      hint="全机构任务量按标签维度横切, 累计型指标 (与时间窗无关); 60s 进程内缓存"
      :loading="loading"
      :generated-at="generatedAt"
      @range-change="reloadByRange"
    >
      <template #kpis>
        <el-row :gutter="16">
          <el-col :xs="12" :sm="6">
            <KpiCard label="总任务数" :value="d.totals?.count || 0" unit="个" accent="default" />
          </el-col>
          <el-col :xs="12" :sm="6">
            <KpiCard label="未完结" :value="d.totals?.open || 0" unit="个" accent="orange" />
          </el-col>
          <el-col :xs="12" :sm="6">
            <KpiCard label="已逾期" :value="d.totals?.overdue || 0" unit="个" accent="red" />
          </el-col>
          <el-col :xs="12" :sm="6">
            <KpiCard label="完成率" :value="d.totals?.completionRate || 0" unit="%" accent="green" />
          </el-col>
        </el-row>
      </template>

      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :xs="24" :md="12">
          <div class="chart-title">Top 5 标签任务数</div>
          <div ref="tagBarRef" class="chart" />
        </el-col>
        <el-col :xs="24" :md="12">
          <div class="chart-title">按状态分布</div>
          <el-table :data="d.byStatus || []" size="small" stripe>
            <el-table-column prop="status" label="状态" />
            <el-table-column prop="count" label="数量" width="100" align="right" />
          </el-table>
        </el-col>
      </el-row>

      <el-row style="margin-top: 16px">
        <el-col :span="24">
          <div class="chart-title">标签任务分布表 (Top 20)</div>
          <el-table :data="d.byTag || []" size="small" stripe>
            <el-table-column prop="tag" label="标签" min-width="120" />
            <el-table-column prop="total" label="总数" width="80" align="right" />
            <el-table-column prop="done" label="已完成" width="90" align="right">
              <template #default="{ row }"><span class="cell-positive">{{ row.done }}</span></template>
            </el-table-column>
            <el-table-column prop="overdue" label="逾期" width="80" align="right">
              <template #default="{ row }"><span class="cell-negative">{{ row.overdue }}</span></template>
            </el-table-column>
            <el-table-column prop="completionRate" label="完成率" width="120" align="right">
              <template #default="{ row }">
                <el-progress :percentage="row.completionRate || 0" :stroke-width="6" />
              </template>
            </el-table-column>
          </el-table>
          <div v-if="!(d.byTag && d.byTag.length)" class="empty-hint">
            本机构暂无带标签的任务 — 先在创建/编辑任务时加几个标签,这里就有内容了
          </div>
        </el-col>
      </el-row>
    </ReportBoard>
  </div>
</template>

<script setup>
/**
 * 2026-08-06: 任务概览经营看板 (R-1957 P3.2)
 *  - 抄 PointsActivityReport 骨架 (ReportBoard + KpiCard + useECharts + useReportApi)
 *  - KPI: 总数 / 未完结 / 已逾期 / 完成率
 *  - 图表: Top 5 标签任务数水平 bar (ECharts)
 *  - 表格: 按状态分布 + 标签任务分布表 Top 20
 */
import { ref, onMounted } from 'vue'
import { useReportApi } from '@/composables/useReportApi'
import { useECharts } from '@/composables/useECharts'
import KpiCard from '@/components/KpiCard.vue'
import ReportBoard from '@/components/report/ReportBoard.vue'

const currentRange = ref({ range: 'month', from: '', to: '' })
const { data: d, loading, generatedAt, load } = useReportApi('taskOverview')

const tagBarRef = ref()

useECharts(
  () => d.value,
  { tagBarRef },
  {
    tagBarRef: () => {
      const list = (d.value.byTag || []).slice(0, 5).reverse()  // 水平 bar 倒序让最大在上
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 80, right: 20, top: 10, bottom: 30 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: list.map((t) => t.tag) },
        series: [
          { type: 'bar', data: list.map((t) => t.total), name: '总数', itemStyle: { color: '#409eff' } },
          { type: 'bar', data: list.map((t) => t.done), name: '已完成', itemStyle: { color: '#67c23a' } },
          { type: 'bar', data: list.map((t) => t.overdue), name: '逾期', itemStyle: { color: '#f56c6c' } }
        ]
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
.empty-hint { color: #909399; font-size: 13px; padding: 16px; text-align: center; }
</style>
