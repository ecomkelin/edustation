<template>
  <div class="page">
    <h2>财务流水</h2>

    <!-- 顶部 4 张汇总卡: 总收入/总支出/净流入/在用账本 -->
    <el-row :gutter="16" class="summary-row">
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-label">总收入</div>
          <div class="stat-value income">+¥{{ formatMoney(summary.income) }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-label">总支出</div>
          <div class="stat-value expense">-¥{{ formatMoney(summary.expense) }}</div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-label">净流入</div>
          <div class="stat-value" :style="{ color: summary.net >= 0 ? '#67c23a' : '#f56c6c' }">
            {{ summary.net >= 0 ? '+' : '' }}¥{{ formatMoney(summary.net) }}
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="hover">
          <div class="stat-label">在用账本</div>
          <div class="stat-value">{{ summary.accountCount }}<span class="stat-unit">本</span></div>
        </el-card>
      </el-col>
    </el-row>

    <div class="toolbar">
      <el-space wrap>
        <el-select v-model="accountFilter" placeholder="账本" clearable filterable style="width: 180px" @change="loadList">
          <el-option
            v-for="a in accountList"
            :key="a._id"
            :label="`${a.name} (${ACCOUNT_TYPE_LABEL[a.type] || a.type})`"
            :value="a._id"
          />
        </el-select>
        <el-select v-model="typeFilter" placeholder="类型" clearable style="width: 120px" @change="loadList">
          <el-option
            v-for="t in txTypes"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </el-select>
        <el-select v-model="reasonFilter" placeholder="原因" clearable filterable style="width: 180px" @change="loadList">
          <el-option
            v-for="r in reasonList"
            :key="r._id"
            :label="r.name"
            :value="r._id"
          />
        </el-select>
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          range-separator="-"
          start-placeholder="开始"
          end-placeholder="结束"
          value-format="YYYY-MM-DD"
          style="width: 240px"
        />
        <el-button @click="loadList">搜索</el-button>
        <el-button type="primary" v-if="canWrite" @click="openCreateTx">录入流水</el-button>
        <el-button type="success" v-if="canWrite" @click="openTransfer">转账</el-button>
      </el-space>
    </div>

    <el-table :data="list" v-loading="loading" style="margin-top: 12px">
      <el-table-column label="时间" width="160">
        <template #default="{ row }">{{ formatDate(row.occurredAt) }}</template>
      </el-table-column>
      <el-table-column label="账本" min-width="160">
        <template #default="{ row }">
          <span v-if="row.account">
            {{ row.account.name }}
            <el-tag v-if="row.type === 'transfer'" type="info" size="small" style="margin-left: 4px">
              {{ row._id && row.relatedTransferAccount && String(row.account._id) !== String(row.relatedTransferAccount._id)
                ? (row.relatedTransferAccount && row.relatedTransferAccount.name ? '→ ' + row.relatedTransferAccount.name : '→ ?') : '← ?' }}
            </el-tag>
          </span>
        </template>
      </el-table-column>
      <el-table-column label="类型" width="80">
        <template #default="{ row }">
          <el-tag :type="TX_TYPE_TAG_TYPE[row.type] || 'info'" size="small">{{ TX_TYPE_LABEL[row.type] || row.type }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="金额" width="120" align="right">
        <template #default="{ row }">
          <strong :style="{ color: row.type === 'income' ? '#67c23a' : (row.type === 'expense' ? '#f56c6c' : '#909399') }">
            {{ row.type === 'income' ? '+' : (row.type === 'expense' ? '-' : '') }}¥{{ formatMoney(row.amount) }}
          </strong>
        </template>
      </el-table-column>
      <el-table-column label="原因" min-width="140">
        <template #default="{ row }">
          <span v-if="row.reason">{{ row.reason.name }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="关联" min-width="170">
        <template #default="{ row }">
          <!-- 2026-06-25: 关联员工/学员/订单; 优先级 员工 > 学员 > 订单 -->
          <span v-if="row.relatedStaff" class="rel-cell">
            <el-tag size="small" type="warning" effect="plain">员工</el-tag>
            {{ row.relatedStaff.realName || row.relatedStaff.mobile }}
          </span>
          <span v-else-if="row.relatedStudent" class="rel-cell">
            <el-tag size="small" type="success" effect="plain">学员</el-tag>
            {{ row.relatedStudent.name }}
          </span>
          <span v-else-if="row.relatedOrder" class="rel-cell">
            <el-tag size="small" type="info" effect="plain">订单</el-tag>
            <span style="font-family: monospace">{{ (row.relatedOrder._id || row.relatedOrder).slice(-6) }}</span>
          </span>
          <span v-else style="color: #c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column label="余额快照" width="120" align="right">
        <template #default="{ row }">¥{{ formatMoney(row.balanceAfter) }}</template>
      </el-table-column>
      <el-table-column label="操作人" width="100">
        <template #default="{ row }">
          <span v-if="row.operator">{{ row.operator.realName || row.operator.mobile }}</span>
          <span v-else style="color: #999">—</span>
        </template>
      </el-table-column>
      <el-table-column label="备注" min-width="180" show-overflow-tooltip>
        <template #default="{ row }">{{ row.remark || '—' }}</template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="page"
      v-model:page-size="pageSize"
      :total="total"
      layout="total, prev, pager, next"
      style="margin-top: 12px"
      @current-change="loadList"
    />

    <TransactionFormDialog
      v-model:visible="txDialogVisible"
      :default-account-id="primaryAccountId"
      @saved="onTxSaved"
    />
    <TransferDialog
      v-model:visible="transferDialogVisible"
      @saved="onTxSaved"
    />
  </div>
</template>

<script setup>
/**
 * 财务流水 (2026-06-25 立项, 2026-06-25 拆自 Finance.vue)
 *
 * 入口: 财务 > 财务流水
 * 顶部 4 张汇总卡: 总收入/总支出/净流入/在用账本
 * 工具栏: 录入流水 / 转账 按钮 (与查询条件并列)
 *
 * 流水不可删 (append-only ledger); 撤销走反向流水
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { financeTransactionApi } from '@/api/finance/transaction'
import { financeAccountApi } from '@/api/finance/account'
import { financeReasonApi } from '@/api/finance/reason'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import {
  FINANCE_ACCOUNT_TYPE_LABEL,
  FINANCE_TX_TYPE_LABEL,
  FINANCE_TX_TYPE_TAG_TYPE
} from '@/utils/constants'
import TransactionFormDialog from './TransactionFormDialog.vue'
import TransferDialog from './TransferDialog.vue'

const auth = useAuthStore()
const canWrite = computed(() => hasPermInOrg(auth, 'finance.write'))

const ACCOUNT_TYPE_LABEL = FINANCE_ACCOUNT_TYPE_LABEL
const TX_TYPE_LABEL = FINANCE_TX_TYPE_LABEL
const TX_TYPE_TAG_TYPE = FINANCE_TX_TYPE_TAG_TYPE
const txTypes = Object.keys(FINANCE_TX_TYPE_LABEL).map((k) => ({ value: k, label: FINANCE_TX_TYPE_LABEL[k] }))

// 汇总卡
const summary = reactive({ income: 0, expense: 0, net: 0, accountCount: 0 })
const primaryAccountId = ref('')
const accountList = ref([])

const accountFilter = ref('')
const typeFilter = ref('')
const reasonFilter = ref('')
const dateRange = ref([])
const list = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(30)
const total = ref(0)
const reasonList = ref([])

const txDialogVisible = ref(false)
const transferDialogVisible = ref(false)

function formatMoney(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function formatDate(t) {
  if (!t) return ''
  const d = new Date(t)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function loadAccounts() {
  try {
    const r = await financeAccountApi.list({ page: 1, pageSize: 200, isActive: true })
    accountList.value = (r.data && r.data.items) || []
    summary.accountCount = accountList.value.filter((a) => a.isActive !== false).length
    const primary = accountList.value.find((a) => a.isPrimary)
    primaryAccountId.value = primary ? primary._id : ''
  } catch (_) { /* 静默 */ }
}

async function loadReasons() {
  try {
    const r = await financeReasonApi.list({ isActive: true })
    reasonList.value = r.data || []
  } catch (_) { /* 静默 */ }
}

async function loadList() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (accountFilter.value) params.accountId = accountFilter.value
    if (typeFilter.value) params.type = typeFilter.value
    if (reasonFilter.value) params.reason = reasonFilter.value
    if (Array.isArray(dateRange.value) && dateRange.value.length === 2) {
      params.dateFrom = dateRange.value[0]
      const end = new Date(dateRange.value[1])
      end.setDate(end.getDate() + 1)
      params.dateTo = end.toISOString().slice(0, 10)
    }
    Object.keys(params).forEach((k) => { if (params[k] === '' || params[k] == null) delete params[k] })
    const r = await financeTransactionApi.list(params)
    list.value = (r.data && r.data.items) || []
    total.value = (r.data && r.data.total) || 0

    // 同步汇总卡 (本月)
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    const sumRes = await financeTransactionApi.summary({
      groupBy: 'reason',
      dateFrom: monthStart
    })
    const totals = (sumRes.data && sumRes.data.totals) || {}
    summary.income = (totals.income || 0) + (totals.transferIn || 0)
    summary.expense = (totals.expense || 0) + (totals.transferOut || 0)
    summary.net = summary.income - summary.expense
  } finally {
    loading.value = false
  }
}

function openCreateTx() {
  if (!canWrite.value) { ElMessage.warning('无 finance.write 权限'); return }
  txDialogVisible.value = true
}
function openTransfer() {
  if (!canWrite.value) { ElMessage.warning('无 finance.write 权限'); return }
  transferDialogVisible.value = true
}

function onTxSaved() { loadList(); loadAccounts() }

onMounted(() => { loadAccounts(); loadReasons(); loadList() })
</script>

<style scoped>
.page h2 { margin-top: 0; }
.summary-row { margin-bottom: 16px; }
.stat-label { font-size: 13px; color: #909399; }
.stat-value { font-size: 24px; font-weight: 600; margin-top: 6px; color: #303133; }
.stat-value.income { color: #67c23a; }
.stat-value.expense { color: #f56c6c; }
.stat-unit { font-size: 13px; color: #909399; margin-left: 4px; font-weight: normal; }
.toolbar { margin-bottom: 12px; }
.rel-cell { display: inline-flex; align-items: center; gap: 4px; }
</style>
