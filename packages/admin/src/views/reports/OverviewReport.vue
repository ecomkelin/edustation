<template>
  <div class="page report-page">
    <div class="report-header">
      <h2>经营总览</h2>
      <div class="report-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <el-button :loading="loading" @click="load" type="primary" plain>
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>

    <p class="hint">按当前机构自动隔离。后端有 60s 缓存，写订单/考勤后自动失效。</p>

    <el-card class="board" shadow="never" v-loading="loading">
      <el-row :gutter="16">
        <el-col :xs="12" :sm="6"><KpiCard label="今日营收" :value="fmtMoney(d.revenue?.today)" accent="green" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="本月营收" :value="fmtMoney(d.revenue?.month)" accent="green" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="待支付金额" :value="fmtMoney(d.orders?.pendingAmount)" :extra="`${d.orders?.pendingCount || 0} 笔`" accent="orange" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="本月已退费" :value="fmtMoney(d.refund?.monthAmount)" :extra="`${d.refund?.monthCount || 0} 笔`" accent="red" /></el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top: 12px">
        <el-col :xs="12" :sm="6"><KpiCard label="在读学员" :value="d.students?.active || 0" unit="人" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="本月新增" :value="d.students?.newMonth || 0" unit="人" accent="blue" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="本月流失" :value="d.students?.droppedMonth || 0" unit="人" accent="red" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="待续费提醒" :value="d.pendingRenewal || 0" unit="人" accent="orange" /></el-col>
      </el-row>
      <el-row :gutter="16" style="margin-top: 12px">
        <el-col :xs="12" :sm="6"><KpiCard label="活跃课包" :value="d.studentProducts?.activeCount || 0" unit="份" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="总剩余课时" :value="d.studentProducts?.totalRemainingLessons || 0" unit="节" accent="blue" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="7 日内过期" :value="d.studentProducts?.expiringSoon7d || 0" unit="份" accent="orange" /></el-col>
        <el-col :xs="12" :sm="6"><KpiCard label="7 日出勤率" :value="fmtPct(d.attendance?.rate)" :extra="`${d.attendance?.attended || 0} / ${d.attendance?.total || 0}`" accent="green" /></el-col>
      </el-row>
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

function fmtMoney(v) {
  if (v == null) return '¥ 0'
  return '¥ ' + Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(v) {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}

async function load() {
  loading.value = true
  try {
    const res = await reportApi.overview({ range: 'month' })
    d.value = res.data?.data || {}
    generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.report-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.report-header h2 { margin: 0; }
.report-header-right { display: flex; align-items: center; gap: 12px; }
.generated-at { color: #909399; font-size: 13px; }
.hint { color: #606266; font-size: 13px; margin: 4px 0 16px; }
.board { margin-bottom: 16px; }
</style>
