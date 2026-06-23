<template>
  <div class="page dashboard">
    <div class="dash-header">
      <h2>欢迎回来，{{ auth.user?.realName || auth.user?.mobile || '同事' }}</h2>
    </div>

    <!-- ───── 核心 1 块：经营总览的"今日要闻"6 Kpi（走 ReportBoard + 权限兜底） ───── -->
    <div v-if="perm.orderRead">
      <ReportBoard
        v-model="currentRange"
        title="今日要闻"
        icon="📊"
        :loading="loading"
        :generated-at="generatedAt"
        @range-change="reloadByRange"
      >
        <template #kpis>
          <el-row :gutter="16">
            <el-col :xs="12" :sm="8" :md="4">
              <KpiCard label="今日营收" :value="fmtMoney(d.revenue?.today)" accent="green" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <KpiCard label="本期营收" :value="fmtMoney(d.revenue?.month)" :extra="`${d.orders?.monthPaid || 0} 笔`" accent="green" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <KpiCard label="待支付" :value="d.orders?.pendingCount || 0" unit="笔" :extra="fmtMoney(d.orders?.pendingAmount)" accent="orange" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <KpiCard label="在读学员" :value="d.students?.active || 0" unit="人" :extra="`本期新增 ${d.students?.newMonth || 0}`" />
            </el-col>
            <el-col :xs="12" :sm="8" :md="4">
              <KpiCard label="7 日出勤率" :value="fmtPct(d.attendance?.rate)" :extra="`${d.attendance?.attended || 0} / ${d.attendance?.total || 0}`" accent="blue" />
            </el-col>
            <el-col :xs="24" :sm="8" :md="4">
              <KpiCard label="待续费提醒" :value="d.pendingRenewal || 0" unit="人" accent="orange" />
            </el-col>
          </el-row>
          <el-row style="margin-top: 12px">
            <el-col :span="24">
              <el-button type="primary" plain @click="$router.push('/reports/overview')">
                查看完整经营总览 →
              </el-button>
            </el-col>
          </el-row>
        </template>
      </ReportBoard>
    </div>
    <NoPermission v-else module="order.read" />

    <!-- ───── 招生 KPI (2026-06 新增) ───── -->
    <el-card v-if="perm.recruitRead" class="board" shadow="never">
      <template #header>
        <div class="board-title">
          📣 招生活跃 (本月)
          <span class="board-title-hint">推广人 / 试听老师 / 家长生命周期</span>
        </div>
      </template>
      <el-row :gutter="16">
        <el-col :xs="12" :sm="6">
          <KpiCard
            label="推广录入"
            :value="recruitStats.promoterCount"
            unit="人"
            :extra="`共录入 ${recruitStats.parentCount} 个家长`"
            accent="blue"
          />
        </el-col>
        <el-col :xs="12" :sm="6">
          <KpiCard
            label="本月已转化"
            :value="recruitStats.convertedCount"
            unit="孩"
            :extra="`转化率 ${recruitStats.conversionRate}%`"
            accent="green"
          />
        </el-col>
        <el-col :xs="12" :sm="6">
          <KpiCard
            label="试听老师 Top 1"
            :value="recruitStats.topTeacher?.realName || '-'"
            :extra="recruitStats.topTeacher ? `转化率 ${recruitStats.topTeacher.conversionRate}%` : ''"
            accent="purple"
          />
        </el-col>
        <el-col :xs="12" :sm="6">
          <KpiCard
            label="沉睡客户"
            :value="recruitStats.dormantCount"
            unit="家长"
            :extra="`需销售主动跟进`"
            accent="orange"
          />
        </el-col>
      </el-row>
      <el-row style="margin-top: 12px">
        <el-col :span="24">
          <el-button type="primary" plain @click="$router.push('/reports/recruit')">
            查看完整招生看板 →
          </el-button>
        </el-col>
      </el-row>
    </el-card>

    <!--
      2026-06-23: 「系统说明」+ 上面两个红框（hint 提示 / ReportBoard 缓存提示）已删除
        - 用户反馈: "当前机构..." / "数据来自..." 两段提示没用, 系统说明也重复 platform/info 已有内容
        - 整块删掉后, 页面只剩 KPI, 留出空间给后续要加的"今日排课时间线"
    -->
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useReportApi } from '@/composables/useReportApi'
import { fmtMoney, fmtPct } from '@/utils/report'
import http from '@/api/http'
import KpiCard from '@/components/KpiCard.vue'
import NoPermission from '@/components/NoPermission.vue'
import ReportBoard from '@/components/report/ReportBoard.vue'

const auth = useAuthStore()
const { user, currentOrgId } = storeToRefs(auth)
const orgName = computed(() => auth.currentOrg?.name || currentOrgId.value || '—')

const currentRange = ref({ range: 'month', from: '', to: '' })
const { data: d, loading, generatedAt, load } = useReportApi('overview')

// 招生活跃 KPI (2026-06)
const recruitStats = ref({
  promoterCount: 0,
  parentCount: 0,
  convertedCount: 0,
  conversionRate: 0,
  topTeacher: null,
  dormantCount: 0
})

const perm = computed(() => ({
  orderRead: hasPerm('report.read') || hasPerm('order.read'),
  recruitRead: hasPerm('recruit.read')
}))
/**
 * 权限校验：
 * - 平台超管直通（与后端 requirePermission / 左侧菜单 isAllowed 行为一致）
 * - 否则从 auth.orgs 中找当前 currentOrgId 的职位聚合权限
 * 修复：原本用 user.permissions 检查,但 publicUser() 出参不包含 permissions 字段,
 *       导致 perms 永远为空 → 兜底返回 true → Dashboard 触发无权限的 recruit 看板请求 → 403
 */
function hasPerm(code) {
  if (user.value?.isPlatformAdmin) return true
  const org = auth.orgs.find((o) => o.id === auth.currentOrgId)
  if (!org) return false
  const perms = new Set()
  for (const p of org.positions || []) {
    if (p && p.isActive !== false) {
      for (const c of p.permissions || []) perms.add(c)
    }
  }
  return perms.has(code)
}

async function loadRecruitKpi() {
  if (!perm.value.recruitRead) return
  try {
    const [promoterRes, teacherRes, parentListRes] = await Promise.all([
      http.get('/reports/recruit-promoter', { params: { range: 'month' } }),
      http.get('/reports/recruit-teacher-conversion', { params: { range: 'month' } }),
      http.get('/parents', { params: { lifecycle: 'dormant', pageSize: 1 } })
    ])
    const promoters = promoterRes.data?.items || []
    const teachers = teacherRes.data?.items || []
    const totalParents = promoters.reduce((sum, p) => sum + (p.parentCount || 0), 0)
    const totalConverted = promoters.reduce((sum, p) => sum + (p.convertedCount || 0), 0)
    recruitStats.value = {
      promoterCount: promoters.length,
      parentCount: totalParents,
      convertedCount: totalConverted,
      conversionRate: totalParents > 0
        ? Math.round((totalConverted / totalParents) * 1000) / 10
        : 0,
      topTeacher: teachers[0] || null,
      dormantCount: parentListRes.data?.total || 0
    }
  } catch (e) {
    // 静默失败, 不阻塞 Dashboard
  }
}

// 6 个模块卡片：与左侧菜单项对齐, 但不显示左侧已显而易见的项
// 2026-06-23: 「系统说明」整块删除后, moduleMap 已无引用, 一并清理
//   若后续想加"今日排课时间线"或"快捷入口", 再单独定义数组

async function reloadByRange(next) {
  currentRange.value = { ...next }
  await load(next)
}

onMounted(() => {
  reloadByRange(currentRange.value)
  loadRecruitKpi()
})
</script>

<style lang="scss" scoped>
.dashboard {
  .dash-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    h2 { margin: 0; }
    .dash-header-right {
      display: flex;
      align-items: center;
      gap: 12px;
      .generated-at { color: #909399; font-size: 13px; }
    }
  }
  .hint { color: #606266; font-size: 13px; margin: 4px 0 16px; }
  .board { margin-bottom: 16px; }
  .board-title {
    font-weight: 600;
    font-size: 15px;
    display: flex;
    align-items: baseline;
    gap: 12px;
  }
  .board-title-hint {
    font-weight: normal;
    font-size: 12px;
    color: #909399;
  }
}
</style>
