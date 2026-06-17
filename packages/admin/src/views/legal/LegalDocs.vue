<template>
  <div class="page">
    <h2>机构法律协议</h2>
    <p class="subtitle">
      管理本机构对外的法律协议。下单流程中的「课程购买协议」「退费规则」会强制让家长勾选同意,
      其他协议(关于本机构 / FAQ / 积分规则等)用于客户端展示。每次保存会自动 bump 版本号并软停旧版,
      历史版本可在「查看历史」中追溯。平台级协议(用户协议 / 隐私 / 未成年人) 由超管在 <code>shared/legal/*.md</code> 升版。
    </p>

    <el-card class="card">
      <el-table v-loading="loading" :data="items" stripe>
        <el-table-column prop="title" label="标题" min-width="180" />
        <el-table-column prop="key" label="key" width="180">
          <template #default="{ row }">
            <el-tag size="small">{{ row.key }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="version" label="当前版本" width="100">
          <template #default="{ row }">
            <el-tag size="small" type="info">v{{ row.version }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="强制同意" width="100" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.isRequired" size="small" type="warning">必勾</el-tag>
            <span v-else class="muted">否</span>
          </template>
        </el-table-column>
        <el-table-column label="拦截作用域" width="120" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.requireScope === 'order'" size="small" type="danger">下单时</el-tag>
            <el-tag v-else-if="row.requireScope === 'login'" size="small">登录时</el-tag>
            <span v-else class="muted">仅展示</span>
          </template>
        </el-table-column>
        <el-table-column label="更新时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button size="small" type="primary" link @click="openEdit(row)">编辑</el-button>
            <el-button size="small" link @click="openHistory(row)">查看历史</el-button>
            <el-button size="small" link type="danger" @click="disable(row)">停用</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="footer-toolbar">
        <span class="hint">未在此处的 key 表示尚未启用,可点击下方按钮新建</span>
        <el-button-group>
          <el-button
            v-for="key in availableKeys"
            :key="key"
            size="small"
            @click="openCreate(key)"
          >+ {{ keyTitle(key) }}</el-button>
        </el-button-group>
      </div>
    </el-card>

    <LegalDocEditDialog
      v-model="dialogVisible"
      :org-id="auth.currentOrgId"
      :edit-key="editKey"
      :initial-data="editingDoc"
      @saved="onSaved"
    />

    <el-dialog v-model="historyVisible" :title="`${historyKey} - 历史版本`" width="800px">
      <el-table v-loading="historyLoading" :data="historyItems" stripe>
        <el-table-column prop="version" label="版本" width="100">
          <template #default="{ row }">v{{ row.version }}</template>
        </el-table-column>
        <el-table-column prop="title" label="标题" min-width="200" />
        <el-table-column label="生效状态" width="100">
          <template #default="{ row }">
            <el-tag v-if="row.isActive" type="success" size="small">生效中</el-tag>
            <el-tag v-else type="info" size="small">已停用</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="编辑人" width="120">
          <template #default="{ row }">
            {{ row.updatedBy?.realName || row.updatedBy?.mobile || '系统' }}
          </template>
        </el-table-column>
        <el-table-column label="编辑时间" width="170">
          <template #default="{ row }">{{ formatTime(row.updatedAt) }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { useAuthStore } from '@/stores/auth'
import { legalApi } from '@/api/legal'
import LegalDocEditDialog from './LegalDocEditDialog.vue'

const auth = useAuthStore()
const items = ref([])
const loading = ref(false)

// 所有支持的 key + 中文名 (与后端 LegalDoc.model.js enum 同步)
const ALL_KEYS = {
  'purchase-agreement': '课程购买协议',
  'refund-policy': '退费规则',
  'org-about': '关于本机构',
  'org-faq': '常见问题 FAQ',
  'points-rule': '积分规则',
  'share-rule': '分享行为规范',
  'org-contact': '联系方式'
}

function keyTitle(k) {
  return ALL_KEYS[k] || k
}

const availableKeys = computed(() => {
  const existing = new Set(items.value.map((d) => d.key))
  return Object.keys(ALL_KEYS).filter((k) => !existing.has(k))
})

function formatTime(t) {
  return t ? dayjs(t).format('YYYY-MM-DD HH:mm') : '-'
}

async function load() {
  if (!auth.currentOrgId) return
  loading.value = true
  try {
    const res = await legalApi.listOrgDocs(auth.currentOrgId, { pageSize: 50 })
    items.value = res.data?.items || []
  } finally {
    loading.value = false
  }
}

// ── 编辑 / 新建 dialog ──
const dialogVisible = ref(false)
const editKey = ref('')
const editingDoc = ref(null)
function openEdit(row) {
  editKey.value = row.key
  editingDoc.value = row
  dialogVisible.value = true
}
function openCreate(key) {
  editKey.value = key
  editingDoc.value = { key, title: ALL_KEYS[key], isRequired: false, requireScope: 'none', contentMarkdown: '' }
  dialogVisible.value = true
}
function onSaved() {
  load()
}

// ── 停用 ──
async function disable(row) {
  try {
    await ElMessageBox.confirm(
      `停用《${row.title}》当前版本 v${row.version}?\n停用后此协议在客户端将不再展示,但历史 UserConsent 记录与 Order.agreements 快照不受影响。`,
      '停用协议',
      { type: 'warning', confirmButtonText: '确认停用', cancelButtonText: '取消' }
    )
  } catch (_) {
    return
  }
  await legalApi.disableOrgDoc(auth.currentOrgId, row.key)
  ElMessage.success('已停用')
  load()
}

// ── 历史 ──
const historyVisible = ref(false)
const historyKey = ref('')
const historyItems = ref([])
const historyLoading = ref(false)
async function openHistory(row) {
  historyKey.value = row.title
  historyVisible.value = true
  historyLoading.value = true
  historyItems.value = []
  try {
    const res = await legalApi.orgDocHistory(auth.currentOrgId, row.key)
    historyItems.value = res.data?.items || []
  } finally {
    historyLoading.value = false
  }
}

onMounted(load)
</script>

<style scoped>
.page { padding: 8px; }
.subtitle { color: #909399; margin: 0 0 16px; font-size: 13px; line-height: 1.6; }
.subtitle code {
  padding: 1px 6px;
  background: #f5f7fa;
  border-radius: 3px;
  font-size: 12px;
  color: #c7254e;
}
.card { margin-bottom: 16px; }
.footer-toolbar {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.hint { color: #909399; font-size: 12px; }
.muted { color: #c0c4cc; }
</style>
