<template>
  <div class="page report-page">
    <ReportBoard
      v-model="currentRange"
      title="老师产能与绩效"
      icon="👨‍🏫"
      hint="本期数据。日均课时 = 本期课时 / range 实际天数；消课率 = 已消 / 已上过。"
      :loading="loading"
      :generated-at="generatedAt"
      @range-change="reloadByRange"
    >
      <template #kpis>
        <el-row :gutter="16">
          <el-col :xs="12" :sm="6"><KpiCard label="老师数" :value="d.summary?.teacherCount || 0" unit="人" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="人均本期课时" :value="d.summary?.avgMonthlyLessons || 0" unit="节" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="人均周课时" :value="d.summary?.avgWeeklyLessons || 0" unit="节" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="平均消课率" :value="fmtPct(d.summary?.avgCompletionRate)" accent="green" /></el-col>
        </el-row>
      </template>

      <div class="chart-title" style="margin-top: 16px">老师明细（按本期已排课时降序）</div>
      <el-table :data="d.teachers || []" size="small" stripe>
        <el-table-column prop="teacherName" label="老师" min-width="120" />
        <el-table-column prop="weeklyLessons" label="周课时" width="80" align="right" />
        <el-table-column prop="monthlyLessons" label="本期课时" width="100" align="right" />
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
    </ReportBoard>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useReportApi } from '@/composables/useReportApi'
import { fmtPct } from '@/utils/report'
import KpiCard from '@/components/KpiCard.vue'
import ReportBoard from '@/components/report/ReportBoard.vue'

const currentRange = ref({ range: 'month', from: '', to: '' })
const { data: d, loading, generatedAt, load } = useReportApi('teacherProductivity')

async function reloadByRange(next) {
  currentRange.value = { ...next }
  await load(next)
}

onMounted(() => reloadByRange(currentRange.value))
</script>

<style scoped>
.report-page { padding: 16px; }
.chart-title { font-size: 13px; color: #606266; margin-bottom: 6px; font-weight: 500; }
.muted { color: #909399; font-size: 12px; }
.cell-danger { color: #f56c6c; font-weight: 600; }
</style>
