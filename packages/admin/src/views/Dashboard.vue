<template>
  <div class="page dashboard">
    <div class="dash-header">
      <h2>欢迎回来，{{ auth.user?.realName || auth.user?.mobile || '同事' }}</h2>
    </div>

    <p class="hint">
      当前机构：<b>{{ orgName }}</b>。完整 5 块经营看板已移到左侧
      <b>「经营分析」</b> 一级菜单（含营收/课消/教室/老师/积分）。
    </p>

    <!-- ───── 核心 1 块：经营总览的"今日要闻"6 Kpi（走 ReportBoard + 权限兜底） ───── -->
    <div v-if="perm.orderRead">
      <ReportBoard
        v-model="currentRange"
        title="今日要闻"
        icon="📊"
        hint="数据来自「经营总览」看板；后端 60s 缓存，写订单/考勤后自动失效"
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

    <!-- ───── 系统说明（复用 platform/info 的内容） ───── -->
    <el-card class="board" shadow="never">
      <template #header>
        <div class="board-title">
          📘 系统说明
          <span class="board-title-hint">系统定位、模块地图、典型流程一站式速览</span>
        </div>
      </template>
      <div class="system-intro">
        <h3>EduStation 是什么</h3>
        <p>
          面向科技 / 艺术类校外培训机构的 <b>SaaS 多租户</b> 管理系统。核心流程：
          <b>学生建档</b> → <b>购买课包</b> → <b>开班报名</b> → <b>排课</b> → <b>上课消课</b> → <b>评价作品</b>。
          所有业务数据通过「机构」字段隔离，第一家机构即第一个租户。
        </p>

        <h3>模块速查</h3>
        <el-row :gutter="12">
          <el-col :xs="24" :sm="12" :md="8" v-for="m in moduleMap" :key="m.path">
            <div class="module-card" @click="$router.push(m.path)">
              <div class="module-icon">{{ m.icon }}</div>
              <div class="module-body">
                <div class="module-title">{{ m.title }}</div>
                <div class="module-desc">{{ m.desc }}</div>
              </div>
            </div>
          </el-col>
        </el-row>

        <h3>典型的一天（按角色）</h3>
        <ul class="role-list">
          <li><b>校长 / 教务主管</b>：看「经营分析」→ 看课消进度 → 处理冲突 → 安排下期开班</li>
          <li><b>老师</b>：在「排课 / 上课表」看今天的课 → 签到 / 消课 → 拍照上传作品 → 给家长写反馈</li>
          <li><b>销售 / 财务</b>：在「订单」开单 / 收款 / 退款；在「学员与订单」建立学员课包</li>
        </ul>

        <div class="more">
          <el-link type="primary" @click="$router.push('/platform/info')">查看完整系统说明 →</el-link>
        </div>
      </div>
    </el-card>
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

// 6 个模块卡片：与左侧菜单项对齐，但不显示左侧已显而易见的项
const moduleMap = [
  { path: '/students',         icon: '👤', title: '学生管理',     desc: '学员档案、家长关联、备注' },
  { path: '/course-products',  icon: '📦', title: '课程产品',     desc: '上架课程 / 课包 / 定价' },
  { path: '/course-instances', icon: '🎒', title: '开班',         desc: '招生 / 上课 / 结业' },
  { path: '/schedule',         icon: '📅', title: '排课',         desc: '按周/月排课 + 冲突检测' },
  { path: '/orders',           icon: '🧾', title: '订单',         desc: '合同 / 收款 / 退款' },
  { path: '/student-works',    icon: '🖼️', title: '学员作品',     desc: '家长可见的作品墙' }
]

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
  .system-intro {
    h3 { font-size: 15px; margin: 16px 0 8px; }
    p { color: #303133; line-height: 1.6; }
    .module-card {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      margin-bottom: 8px;
      border: 1px solid #ebeef5;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      &:hover {
        border-color: #409eff;
        background: #f0f9ff;
      }
      .module-icon { font-size: 24px; }
      .module-body { flex: 1; }
      .module-title { font-weight: 600; font-size: 14px; }
      .module-desc { color: #909399; font-size: 12px; margin-top: 2px; }
    }
    .role-list {
      color: #303133;
      line-height: 1.8;
      li { margin-bottom: 4px; }
    }
    .more { margin-top: 12px; }
  }
}
</style>
