<template>
  <div class="page">
    <h2>积分管理</h2>

    <el-tabs v-model="activeTab">
      <!-- Tab 1: 学生积分账户 -->
      <el-tab-pane label="学生积分账户" name="accounts">
        <el-space wrap>
          <el-input
            v-model="keyword"
            placeholder="搜索学生姓名 / 监护人手机号"
            clearable
            style="width: 240px"
            @keyup.enter="loadAccounts"
          />
          <el-select v-model="sortBy" style="width: 160px" @change="loadAccounts">
            <el-option label="余额降序" value="balance-desc" />
            <el-option label="最近活跃" value="recent" />
            <el-option label="姓名 A-Z" value="name" />
          </el-select>
          <el-button @click="loadAccounts">搜索</el-button>
          <el-button @click="resetAccounts">重置</el-button>
        </el-space>

        <el-table :data="accountList" v-loading="accountsLoading" style="margin-top: 16px">
          <el-table-column prop="name" label="学生" width="140" />
          <el-table-column label="监护人" width="220">
            <template #default="{ row }">
              <span v-for="g in row.guardians" :key="g._id" style="margin-right: 6px">
                {{ g.realName || g.mobile || '—' }}
              </span>
              <span v-if="!row.guardians || !row.guardians.length" style="color: #999">未登记</span>
            </template>
          </el-table-column>
          <el-table-column label="当前余额" width="120" align="right">
            <template #default="{ row }">
              <strong :style="{ color: row.balance > 0 ? '#f56c6c' : '#999' }">
                {{ formatNumber(row.balance) }}
              </strong>
            </template>
          </el-table-column>
          <el-table-column label="累计入账" width="120" align="right">
            <template #default="{ row }">
              <span style="color: #67c23a">+{{ formatNumber(row.totalEarned) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="累计出账" width="120" align="right">
            <template #default="{ row }">
              <span style="color: #909399">-{{ formatNumber(row.totalSpent) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="最近活跃" width="180">
            <template #default="{ row }">
              <span v-if="row.lastTransactionAt">{{ formatDate(row.lastTransactionAt) }}</span>
              <span v-else style="color: #999">尚无流水</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button size="small" link @click="goToStudentFlow(row)">查看流水</el-button>
              <el-button
                v-if="canWrite"
                size="small"
                type="primary"
                link
                @click="openAdjust(row)"
              >调整积分</el-button>
            </template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="accountsPage"
          v-model:page-size="accountsPageSize"
          :total="accountsTotal"
          layout="total, prev, pager, next"
          style="margin-top: 16px"
          @current-change="loadAccounts"
        />
      </el-tab-pane>

      <!-- Tab 2: 流水记录 -->
      <el-tab-pane label="流水记录" name="transactions">
        <el-space wrap>
          <el-input
            v-model="txKeyword"
            placeholder="搜索学生姓名"
            clearable
            style="width: 200px"
            @keyup.enter="loadTransactions"
          />
          <el-select
            v-model="txTriggerFilter"
            placeholder="触发类型"
            multiple
            collapse-tags
            clearable
            style="width: 280px"
          >
            <el-option
              v-for="t in TRIGGER_OPTIONS"
              :key="t.value"
              :label="t.label"
              :value="t.value"
            />
          </el-select>
          <el-date-picker
            v-model="txDateRange"
            type="daterange"
            range-separator="-"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            value-format="YYYY-MM-DD"
          />
          <el-button @click="loadTransactions">搜索</el-button>
          <el-button @click="resetTransactions">重置</el-button>
        </el-space>

        <el-table :data="txList" v-loading="txLoading" style="margin-top: 16px">
          <el-table-column label="时间" width="170">
            <template #default="{ row }">{{ formatDate(row.createdAt) }}</template>
          </el-table-column>
          <el-table-column label="学生" width="140">
            <template #default="{ row }">
              <span v-if="row.student">{{ row.student.name }}</span>
              <span v-else style="color: #999">—</span>
            </template>
          </el-table-column>
          <el-table-column label="方向 / 数量" width="120" align="right">
            <template #default="{ row }">
              <strong :style="{ color: row.amount > 0 ? '#67c23a' : '#f56c6c' }">
                {{ row.amount > 0 ? '+' : '' }}{{ formatNumber(row.amount) }}
              </strong>
            </template>
          </el-table-column>
          <el-table-column label="余额快照" width="100" align="right">
            <template #default="{ row }">
              <span v-if="row.balanceAfter !== null && row.balanceAfter !== undefined">
                {{ formatNumber(row.balanceAfter) }}
              </span>
              <span v-else style="color: #999">—</span>
            </template>
          </el-table-column>
          <el-table-column label="触发类型" width="140">
            <template #default="{ row }">
              <el-tag :type="triggerTagType(row.trigger)" size="small">
                {{ triggerLabel(row.trigger) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="原因" min-width="160">
            <template #default="{ row }">
              <span v-if="row.reason">{{ row.reason.name }}</span>
              <span v-else style="color: #999">—</span>
            </template>
          </el-table-column>
          <el-table-column label="操作人" width="120">
            <template #default="{ row }">
              <span v-if="row.operator">{{ row.operator.realName || row.operator.mobile }}</span>
              <span v-else style="color: #999">系统</span>
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="200" show-overflow-tooltip>
            <template #default="{ row }">{{ row.remark || '—' }}</template>
          </el-table-column>
        </el-table>

        <el-pagination
          v-model:current-page="txPage"
          v-model:page-size="txPageSize"
          :total="txTotal"
          layout="total, prev, pager, next"
          style="margin-top: 16px"
          @current-change="loadTransactions"
        />
      </el-tab-pane>
    </el-tabs>

    <PointsAdjustDialog
      v-if="adjustDialog.student"
      v-model:visible="adjustDialog.visible"
      :student="adjustDialog.student"
      @saved="onAdjustSaved"
    />
  </div>
</template>

<script setup>
/**
 * 积分管理主页面 (2026-06-21)
 *
 *   Tab 1: 学生积分账户
 *     - 列出本机构所有学员 + 当前余额/累计入账/累计出账/最近活跃
 *     - 行操作: 查看流水 / 调整积分
 *   Tab 2: 流水记录
 *     - 全机构流水, 按学生/触发类型/日期过滤
 *
 * URL query 支持:
 *   ?studentId=<id>   自动跳到 Tab 2 并按学生过滤（学生画像"查看流水"按钮跳过来用）
 *   ?tab=transactions 配合上面的 studentId 用
 */
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { pointsAdminApi } from '@/api/pointsAdmin'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import PointsAdjustDialog from './PointsAdjustDialog.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const canWrite = computed(() => hasPermInOrg(auth, 'points.write'))

const TRIGGER_OPTIONS = [
  { value: 'manual_earn', label: '员工加分' },
  { value: 'manual_deduct', label: '员工扣分' },
  { value: 'order_earn', label: '下单加分' },
  { value: 'attendance_earn', label: '出勤加分' },
  { value: 'streak_earn', label: '连续出勤' },
  { value: 'share_earn', label: '分享加分' },
  { value: 'birthday_earn', label: '生日加分' },
  { value: 'pet', label: '宠物扣分' },
  { value: 'redemption', label: '兑换扣分' },
  { value: 'refund', label: '冲正' }
]

const TRIGGER_LABELS = Object.fromEntries(TRIGGER_OPTIONS.map((t) => [t.value, t.label]))

const activeTab = ref('accounts')

// ── Tab 1 state ──
const keyword = ref('')
const sortBy = ref('balance-desc')
const accountList = ref([])
const accountsLoading = ref(false)
const accountsPage = ref(1)
const accountsPageSize = ref(20)
const accountsTotal = ref(0)

// ── Tab 2 state ──
const txList = ref([])
const txLoading = ref(false)
const txPage = ref(1)
const txPageSize = ref(30)
const txTotal = ref(0)
const txKeyword = ref('')
const txTriggerFilter = ref([])
const txDateRange = ref([])

// ── Adjust dialog ──
const adjustDialog = reactive({ visible: false, student: null })

function formatNumber(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN')
}

function formatDate(t) {
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function triggerLabel(t) {
  return TRIGGER_LABELS[t] || t
}

function triggerTagType(t) {
  if (!t) return 'info'
  if (t.endsWith('_earn')) return 'success'
  if (t === 'manual_deduct') return 'warning'
  if (t === 'pet' || t === 'redemption') return 'danger'
  if (t === 'refund') return 'info'
  return ''
}

async function loadAccounts() {
  accountsLoading.value = true
  try {
    const params = {
      page: accountsPage.value,
      pageSize: accountsPageSize.value,
      keyword: keyword.value,
      sortBy: sortBy.value
    }
    Object.keys(params).forEach((k) => { if (params[k] === '' || params[k] == null) delete params[k] })
    const r = await pointsAdminApi.listAccounts(params)
    accountList.value = r.data.items || []
    accountsTotal.value = r.data.total || 0
  } finally {
    accountsLoading.value = false
  }
}

function resetAccounts() {
  keyword.value = ''
  sortBy.value = 'balance-desc'
  accountsPage.value = 1
  loadAccounts()
}

async function loadTransactions() {
  txLoading.value = true
  try {
    const params = {
      page: txPage.value,
      pageSize: txPageSize.value,
      keyword: txKeyword.value,
      studentId: route.query.studentId || ''
    }
    if (Array.isArray(txTriggerFilter.value) && txTriggerFilter.value.length) {
      params.trigger = txTriggerFilter.value.join(',')
    }
    if (Array.isArray(txDateRange.value) && txDateRange.value.length === 2) {
      params.from = txDateRange.value[0]
      // to 加一天把当天结束时间包含进去（service 层用 new Date(to) <=）
      const end = new Date(txDateRange.value[1])
      end.setDate(end.getDate() + 1)
      params.to = end.toISOString().slice(0, 10)
    }
    Object.keys(params).forEach((k) => { if (params[k] === '' || params[k] == null) delete params[k] })
    const r = await pointsAdminApi.listTransactions(params)
    txList.value = r.data.items || []
    txTotal.value = r.data.total || 0
  } finally {
    txLoading.value = false
  }
}

function resetTransactions() {
  txKeyword.value = ''
  txTriggerFilter.value = []
  txDateRange.value = []
  txPage.value = 1
  // 清掉 URL 上的 studentId 过滤
  if (route.query.studentId) {
    router.replace({ query: { ...route.query, studentId: undefined } })
  }
  loadTransactions()
}

function openAdjust(row) {
  if (!canWrite.value) {
    ElMessage.warning('无 points.write 权限')
    return
  }
  adjustDialog.student = { ...row, id: row._id }
  adjustDialog.visible = true
}

function onAdjustSaved() {
  // 两个 tab 都要刷新, 因为余额变化 + 新流水
  loadAccounts()
  loadTransactions()
}

function goToStudentFlow(row) {
  router.push({ query: { ...route.query, studentId: row._id, tab: 'transactions' } })
  activeTab.value = 'transactions'
  loadTransactions()
}

// 监听 URL query.studentId 变化（学生画像跳过来用）
watch(
  () => route.query,
  (q) => {
    if (q.tab) activeTab.value = q.tab
    if (q.studentId) {
      activeTab.value = 'transactions'
      txPage.value = 1
      loadTransactions()
    }
  }
)

onMounted(() => {
  // 如果 URL 带 studentId, 自动跳到流水 tab + 过滤
  if (route.query.studentId) {
    activeTab.value = 'transactions'
  }
  loadAccounts()
  if (activeTab.value === 'transactions') loadTransactions()
})
</script>

<style scoped>
.page h2 { margin-top: 0; }
</style>
