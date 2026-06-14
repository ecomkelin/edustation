<template>
  <div class="page report-page">
    <ReportBoard
      v-model="currentRange"
      title="经营总览"
      icon="📊"
      :hint="hint"
      :loading="loading"
      :generated-at="generatedAt"
      @range-change="reloadByRange"
    >
      <template #kpis>
        <el-row :gutter="16">
          <el-col :xs="12" :sm="6"><KpiCard label="今日营收" :value="fmtMoney(d.revenue?.today)" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本期营收" :value="fmtMoney(d.revenue?.month)" :extra="`${d.orders?.monthPaid || 0} 笔`" accent="green" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="待支付金额" :value="fmtMoney(d.orders?.pendingAmount)" :extra="`${d.orders?.pendingCount || 0} 笔`" accent="orange" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本期已退费" :value="fmtMoney(d.refund?.monthAmount)" :extra="`${d.refund?.monthCount || 0} 笔`" accent="red" /></el-col>
        </el-row>
        <el-row :gutter="16" style="margin-top: 12px">
          <el-col :xs="12" :sm="6"><KpiCard label="在读学员" :value="d.students?.active || 0" unit="人" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本期新增" :value="d.students?.newMonth || 0" unit="人" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="本期流失" :value="d.students?.droppedMonth || 0" unit="人" accent="red" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="待续费提醒" :value="d.pendingRenewal || 0" unit="人" accent="orange" /></el-col>
        </el-row>
        <el-row :gutter="16" style="margin-top: 12px">
          <el-col :xs="12" :sm="6"><KpiCard label="活跃课包" :value="d.studentProducts?.activeCount || 0" unit="份" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="总剩余课时" :value="d.studentProducts?.totalRemainingLessons || 0" unit="节" accent="blue" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="7 日内过期" :value="d.studentProducts?.expiringSoon7d || 0" unit="份" accent="orange" /></el-col>
          <el-col :xs="12" :sm="6"><KpiCard label="7 日出勤率" :value="fmtPct(d.attendance?.rate)" :extra="`${d.attendance?.attended || 0} / ${d.attendance?.total || 0}`" accent="green" /></el-col>
        </el-row>
      </template>
    </ReportBoard>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useReportApi } from '@/composables/useReportApi'
import { fmtMoney, fmtPct } from '@/utils/report'
import KpiCard from '@/components/KpiCard.vue'
import ReportBoard from '@/components/report/ReportBoard.vue'

const currentRange = ref({ range: 'month', from: '', to: '' })
const { data: d, loading, generatedAt, load } = useReportApi('overview')

const hint = computed(() => {
  // 后端字段名 monthAmount 沿用老接口（语义已扩展为 "range-bound"）
  if (currentRange.value.range === 'today') return '今日 0:00 → 明日 0:00 的指标。后端 60s 缓存，写订单/考勤后自动失效。'
  if (currentRange.value.range === 'week') return '近 7 天指标。后端 60s 缓存，写订单/考勤后自动失效。'
  if (currentRange.value.range === 'custom') return '自定义时间窗指标。后端 60s 缓存，写订单/考勤后自动失效。'
  return '本月指标。后端 60s 缓存，写订单/考勤后自动失效。'
})

async function reloadByRange(next) {
  currentRange.value = { ...next }
  await load(next)
}

onMounted(() => reloadByRange(currentRange.value))
</script>

<style scoped>
.report-page { padding: 16px; }
</style>
