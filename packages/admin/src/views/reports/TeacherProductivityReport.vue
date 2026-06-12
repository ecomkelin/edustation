<template>
  <div class="page report-page">
    <div class="report-header">
      <h2>老师产能与绩效</h2>
      <div class="report-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <el-button :loading="loading" @click="load" type="primary" plain>
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>

    <p class="hint">本月数据。日均课时 = 本月课时 / 当月天数；消课率 = 已消 / 已上过。</p>

    <el-card class="board" shadow="never" v-loading="loading">
      <el-row :gutter="16">
        <el-col :xs="12" :sm="6"><KpiCard label="老师数" :value="d.summary?.teacherCount || 0" unit="人" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="人均月课时" :value="d.summary?.avgMonthlyLessons || 0" unit="节" accent="blue" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="人均周课时" :value="d.summary?.avgWeeklyLessons || 0" unit="节" accent="blue" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="平均消课率" :value="fmtPct(d.summary?.avgCompletionRate)" accent="green" /></el-col>
      </el-row>

      <div class="chart-title" style="margin-top: 16px">老师明细（按本月已排课时降序）</div>
      <el-table :data="d.teachers || []" size="small" stripe>
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
    </el-card>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { Refresh } from '@element-plus/icons-vue'
import { reportApi } from '@/api/report'
import KpiCard from '@/components/KpiCard.vue'

const d = ref({})
const loading = ref(false)
const generatedAt = ref('')

function fmtPct(v) {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}

async function load() {
  loading.value = true
  try {
    const res = await reportApi.teacherProductivity({ range: 'month' })
    d.value = res.data?.data || {}
    generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.report-header { display: flex; justify-content: space-between; align-items: center; }
.report-header h2 { margin: 0; }
.report-header-right { display: flex; align-items: center; gap: 12px; }
.generated-at { color: #909399; font-size: 13px; }
.hint { color: #606266; font-size: 13px; margin: 4px 0 16px; }
.board { margin-bottom: 16px; }
.muted { color: #909399; font-size: 12px; }
.cell-danger { color: #f56c6c; font-weight: 600; }
</style>
