<template>
  <div class="page dashboard">
    <div class="dash-header">
      <h2>欢迎回来，{{ auth.user?.realName || auth.user?.mobile || '同事' }}</h2>
      <div class="dash-header-right">
        <span class="generated-at" v-if="generatedAt">更新于 {{ generatedAt }}</span>
        <el-button :loading="loading" @click="load" type="primary" plain>
          <el-icon><Refresh /></el-icon><span>刷新</span>
        </el-button>
      </div>
    </div>

    <p class="hint">
      当前机构：<b>{{ orgName }}</b>。完整 5 块经营看板已移到左侧
      <b>「经营分析」</b> 一级菜单（含营收/课消/教室/老师/积分）。
    </p>

    <!-- ───── 核心 1 块：经营总览（最关键的 5 个数字） ───── -->
    <el-card class="board" shadow="hover">
      <template #header>
        <div class="board-title">
          📊 今日要闻
          <span class="board-title-hint">数据来自「经营总览」看板；后端 60s 缓存，写订单/考勤后自动失效</span>
        </div>
      </template>
      <div v-if="perm.orderRead">
        <el-row :gutter="16" v-loading="loading">
          <el-col :xs="12" :sm="8" :md="5">
            <KpiCard label="今日营收" :value="fmtMoney(d.revenue?.today)" accent="green" />
          </el-col>
          <el-col :xs="12" :sm="8" :md="5">
            <KpiCard label="本月营收" :value="fmtMoney(d.revenue?.month)" :extra="`${d.orders?.monthPaid || 0} 笔`" accent="green" />
          </el-col>
          <el-col :xs="12" :sm="8" :md="5">
            <KpiCard label="在读学员" :value="d.students?.active || 0" unit="人" :extra="`本月新增 ${d.students?.newMonth || 0}`" />
          </el-col>
          <el-col :xs="12" :sm="8" :md="5">
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
      </div>
      <NoPermission v-else module="order.read" />
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
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { Refresh } from '@element-plus/icons-vue'
import { reportApi } from '@/api/report'
import KpiCard from '@/components/KpiCard.vue'
import NoPermission from '@/components/NoPermission.vue'

const auth = useAuthStore()
const { user, currentOrgId } = storeToRefs(auth)
const orgName = computed(() => auth.currentOrg?.name || currentOrgId.value || '—')

const d = ref({})
const loading = ref(false)
const generatedAt = ref('')

const perm = computed(() => ({
  // 首页 1 块看板用 report.read（更准确），无权限时给 NoPermission 兜底
  orderRead: hasPerm('report.read') || hasPerm('order.read')
}))
function hasPerm(code) {
  const perms = user.value?.permissions || []
  if (perms.length === 0) return true
  return perms.includes(code)
}

function fmtMoney(v) {
  if (v == null) return '¥ 0'
  return '¥ ' + Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(v) {
  if (v == null) return '—'
  return v.toFixed(1) + '%'
}

// 5 块模块卡片：与左侧菜单项对齐，但不显示左侧已显而易见的项
const moduleMap = [
  { path: '/students',         icon: '👤', title: '学生管理',     desc: '学员档案、家长关联、备注' },
  { path: '/course-products',  icon: '📦', title: '课程产品',     desc: '上架课程 / 课包 / 定价' },
  { path: '/course-instances', icon: '🎒', title: '开班',         desc: '招生 / 上课 / 结业' },
  { path: '/schedule',         icon: '📅', title: '排课',         desc: '按周/月排课 + 冲突检测' },
  { path: '/orders',           icon: '🧾', title: '订单',         desc: '合同 / 收款 / 退款' },
  { path: '/student-works',    icon: '🖼️', title: '学员作品',     desc: '家长可见的作品墙' }
]

async function load() {
  if (!currentOrgId.value) return
  loading.value = true
  try {
    const res = await reportApi.overview({ range: 'month' })
    d.value = res.data?.data || {}
    generatedAt.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
  } catch (e) {
    // 失败时让数字都显示 — 已在 template 兜底
  } finally {
    loading.value = false
  }
}

onMounted(load)
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
    line-height: 1.7;
    color: #303133;
    h3 {
      margin: 12px 0 6px;
      font-size: 14px;
      color: #303133;
    }
    h3:first-child { margin-top: 0; }
    p { margin: 0 0 8px; color: #606266; font-size: 13px; }
    .module-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      margin-bottom: 8px;
      background: #f5f7fa;
      border-radius: 6px;
      cursor: pointer;
      transition: background 0.15s;
      &:hover { background: #ecf5ff; }
      .module-icon { font-size: 22px; line-height: 1; }
      .module-title { font-weight: 600; font-size: 13px; }
      .module-desc { font-size: 12px; color: #909399; }
      .module-body { flex: 1; min-width: 0; }
    }
    .role-list {
      margin: 0 0 8px;
      padding-left: 20px;
      color: #606266;
      font-size: 13px;
      li { margin-bottom: 4px; }
    }
    .more { margin-top: 8px; }
  }
}
</style>
