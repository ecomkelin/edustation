<template>
  <div class="page">
    <h2>账本管理</h2>

    <div class="toolbar">
      <el-space wrap>
        <el-input
          v-model="search"
          placeholder="搜索账本名 / 户名 / 微信 / 支付宝"
          clearable
          style="width: 260px"
          @keyup.enter="loadList"
        />
        <el-select v-model="typeFilter" placeholder="类型" clearable style="width: 140px" @change="loadList">
          <el-option
            v-for="t in accountTypes"
            :key="t.value"
            :label="t.label"
            :value="t.value"
          />
        </el-select>
        <el-select v-model="activeFilter" placeholder="启用" clearable style="width: 120px" @change="loadList">
          <el-option label="已启用" value="true" />
          <el-option label="已停用" value="false" />
        </el-select>
        <el-button @click="loadList">搜索</el-button>
        <el-button type="primary" v-if="canWrite" @click="openCreate">新建账本</el-button>
      </el-space>
    </div>

    <el-table :data="list" v-loading="loading" style="margin-top: 12px">
      <el-table-column label="默认" width="70" align="center">
        <template #default="{ row }">
          <el-tag v-if="row.isPrimary" type="success" size="small">默认</el-tag>
          <span v-else style="color: #c0c4cc">—</span>
        </template>
      </el-table-column>
      <el-table-column prop="name" label="账本名" min-width="180" />
      <el-table-column label="类型" width="90">
        <template #default="{ row }">
          <el-tag :type="ACCOUNT_TYPE_TAG_TYPE[row.type] || 'info'" size="small">
            {{ ACCOUNT_TYPE_LABEL[row.type] || row.type }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="详情" min-width="220">
        <template #default="{ row }">
          <span v-if="row.type === 'bank'">
            {{ row.bankName }} · {{ row.accountHolder }} · 尾号 {{ row.accountNumberLast4 }}
          </span>
          <span v-else-if="row.type === 'wechat'">{{ row.wechatId }}</span>
          <span v-else-if="row.type === 'alipay'">{{ row.alipayId }}</span>
          <span v-else-if="row.type === 'cash' && row.location">{{ row.location }}</span>
          <span v-else style="color: #909399">—</span>
        </template>
      </el-table-column>
      <el-table-column label="当前余额" width="140" align="right">
        <template #default="{ row }">
          <strong :style="{ color: row.balance >= 0 ? '#67c23a' : '#f56c6c' }">
            {{ row.balance >= 0 ? '' : '-' }}¥{{ formatMoney(Math.abs(row.balance)) }}
          </strong>
        </template>
      </el-table-column>
      <el-table-column label="状态" width="80">
        <template #default="{ row }">
          <el-tag :type="row.isActive !== false ? 'success' : 'info'" size="small">
            {{ row.isActive !== false ? '启用' : '停用' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="220" fixed="right">
        <template #default="{ row }">
          <el-button size="small" @click="openEdit(row)">编辑</el-button>
          <DestructiveConfirm
            v-if="isPlatformAdmin"
            :target="`账本 ${row.name}`"
            warning="高风险"
            :precheck-notes="['账本余额必须为 0', '默认账本不可物理删除', '无任何流水引用']"
            :precheck="() => financeAccountApi.removableCheck(row._id).then((r) => r.data)"
            @confirm="(p) => onRemoveConfirm(row, p)"
          >
            <el-button size="small" type="danger" :disabled="row.isPrimary">误操删除</el-button>
          </DestructiveConfirm>
        </template>
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

    <AccountFormDialog
      v-model:visible="dialogVisible"
      :account="editTarget"
      @saved="onSaved"
    />
  </div>
</template>

<script setup>
/**
 * 账本管理 (2026-06-25 立项, 2026-06-25 拆自 Finance.vue)
 *
 * 入口: 机构管理 > 基础数据 > 账本管理
 * 物理删除: 走 requirePlatformPassword + 业务硬门 (balance===0, 非 isPrimary)
 */
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { financeAccountApi } from '@/api/finance/account'
import { useAuthStore } from '@/stores/auth'
import { hasPermInOrg } from '@/utils/permissionHelper'
import { handleRemoveError } from '@/utils/removable'
import {
  FINANCE_ACCOUNT_TYPE_LABEL,
  FINANCE_ACCOUNT_TYPE_TAG_TYPE
} from '@/utils/constants'
import DestructiveConfirm from '@/components/DestructiveConfirm.vue'
import AccountFormDialog from './AccountFormDialog.vue'

const auth = useAuthStore()
const canWrite = computed(() => hasPermInOrg(auth, 'finance.write'))
const isPlatformAdmin = computed(() => !!auth.user && auth.user.isPlatformAdmin)

const ACCOUNT_TYPE_LABEL = FINANCE_ACCOUNT_TYPE_LABEL
const ACCOUNT_TYPE_TAG_TYPE = FINANCE_ACCOUNT_TYPE_TAG_TYPE
const accountTypes = Object.keys(FINANCE_ACCOUNT_TYPE_LABEL).map((k) => ({ value: k, label: FINANCE_ACCOUNT_TYPE_LABEL[k] }))

const search = ref('')
const typeFilter = ref('')
const activeFilter = ref('')
const list = ref([])
const loading = ref(false)
const page = ref(1)
const pageSize = ref(20)
const total = ref(0)

const dialogVisible = ref(false)
const editTarget = ref(null)

function formatMoney(n) {
  const v = Number(n) || 0
  return v.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function loadList() {
  loading.value = true
  try {
    const params = { page: page.value, pageSize: pageSize.value }
    if (search.value) params.search = search.value
    if (typeFilter.value) params.type = typeFilter.value
    if (activeFilter.value) params.isActive = activeFilter.value
    Object.keys(params).forEach((k) => { if (params[k] === '' || params[k] == null) delete params[k] })
    const r = await financeAccountApi.list(params)
    list.value = (r.data && r.data.items) || []
    total.value = (r.data && r.data.total) || 0
  } finally {
    loading.value = false
  }
}

function openCreate() {
  if (!canWrite.value) { ElMessage.warning('无 finance.write 权限'); return }
  editTarget.value = null
  dialogVisible.value = true
}
function openEdit(row) {
  if (!canWrite.value) { ElMessage.warning('无 finance.write 权限'); return }
  editTarget.value = { ...row, id: row._id }
  dialogVisible.value = true
}

async function onRemoveConfirm(row, { password }) {
  try {
    await financeAccountApi.remove(row._id, { password })
    ElMessage.success('已删除')
    loadList()
  } catch (e) {
    await handleRemoveError(e, '无法删除 · 高风险', `账本 ${row.name}`)
  }
}

function onSaved() { loadList() }

onMounted(() => { loadList() })
</script>

<style scoped>
.page h2 { margin-top: 0; }
.toolbar { margin-bottom: 12px; }
</style>
