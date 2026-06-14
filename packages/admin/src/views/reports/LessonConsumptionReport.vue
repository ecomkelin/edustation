<template>
  <div class="page report-page">
    <ReportBoard
      v-model="currentRange"
      title="课消与课表"
      icon="📚"
      hint="本期数据。后端 60s 缓存，写考勤后自动失效。"
      :loading="loading"
      :generated-at="generatedAt"
      @range-change="reloadByRange"
    >
      <template #kpis>
        <el-row :gutter="16">
          <el-col :xs="12" :sm="6"><KpiCard label="本期已消课" :value="d.lessons?.completed || 0" unit="节" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本期计划消" :value="d.lessons?.planned || 0" unit="节" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="课消率" :value="fmtPct(d.lessons?.consumptionRate)" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="出勤率" :value="fmtPct(d.attendance?.rates?.attendedRate)" accent="green" /></el-col>
        </el-row>
      </template>

      <el-row :gutter="16" style="margin-top: 16px">
        <el-col :xs="24" :md="10">
          <div class="chart-title">本期考勤分布</div>
          <div ref="attendancePieRef" class="chart" />
        </el-col>
        <el-col :xs="24" :md="14">
          <div class="chart-title">老师产能 Top 10（按本期已排课时）</div>
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
    </ReportBoard>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useReportApi } from '@/composables/useReportApi'
import { useECharts } from '@/composables/useECharts'
import { fmtPct, statusLabel } from '@/utils/report'
import KpiCard from '@/components/KpiCard.vue'
import ReportBoard from '@/components/report/ReportBoard.vue'

const currentRange = ref({ range: 'month', from: '', to: '' })
const { data: d, loading, generatedAt, load } = useReportApi('lessonConsumption')

const attendancePieRef = ref()
const teacherTopBarRef = ref()

useECharts(
  () => d.value,
  { attendancePieRef, teacherTopBarRef },
  {
    attendancePieRef: () => {
      const dist = d.value.attendance?.distribution || {}
      const COLOR = { completed: '#67c23a', checked_in: '#409eff', madeup: '#909399', no_show: '#f56c6c', leave: '#e6a23c' }
      const LABEL = { completed: '已消课', checked_in: '已签到', madeup: '已补课', no_show: '未到', leave: '请假' }
      const data = Object.keys(LABEL)
        .map((k) => ({ name: LABEL[k], value: dist[k] || 0, itemStyle: { color: COLOR[k] } }))
        .filter((x) => x.value > 0)
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c} 节 ({d}%)' },
        legend: { bottom: 0, left: 'center' },
        series: [{ type: 'pie', radius: ['45%', '70%'], avoidLabelOverlap: true, label: { show: false }, data }]
      }
    },
    teacherTopBarRef: () => {
      const list = (d.value.teacherTop || []).slice(0, 10)
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 80, right: 20, top: 10, bottom: 20 },
        xAxis: { type: 'value' },
        yAxis: { type: 'category', data: list.map((t) => t.teacherName).reverse(), axisLabel: { fontSize: 11 } },
        series: [{ type: 'bar', data: list.map((t) => t.lessonCount).reverse(), itemStyle: { color: '#409eff' } }]
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
.muted { color: #909399; font-size: 12px; }
.cell-strong { font-weight: 600; }
.cell-danger { color: #f56c6c; font-weight: 600; }
</style>
