<template>
  <div class="ai-conv-admin">
    <!-- 顶部筛选 -->
    <el-card class="filter-card" shadow="never">
      <el-form :inline="true" :model="filters" @submit.prevent="onSearch">
        <el-form-item label="公司">
          <el-input
            v-model="filters.orgName"
            placeholder="按机构名/简称/编码模糊搜索"
            clearable
            style="width: 200px"
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
        </el-form-item>
        <el-form-item label="用户">
          <el-input
            v-model="filters.mobile"
            placeholder="按用户手机号模糊搜索"
            clearable
            style="width: 180px"
            @keyup.enter="onSearch"
            @clear="onSearch"
          />
        </el-form-item>
        <el-form-item label="是否删除">
          <el-select
            v-model="filters.isDeleted"
            placeholder="全部"
            clearable
            style="width: 130px"
            @change="onSearch"
          >
            <el-option label="未删除" :value="false" />
            <el-option label="已删除" :value="true" />
          </el-select>
        </el-form-item>
        <el-form-item label="最后消息时间">
          <el-date-picker
            v-model="filters.dateRange"
            type="datetimerange"
            range-separator="至"
            start-placeholder="开始"
            end-placeholder="结束"
            value-format="YYYY-MM-DDTHH:mm:ss.SSSZ"
            style="width: 360px"
            @change="onSearch"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :icon="Search" @click="onSearch">搜索</el-button>
          <el-button :icon="Refresh" @click="onReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 列表 -->
    <el-card class="list-card" shadow="never">
      <!-- (2026-06-18) 超管批量物理删除: 不可恢复, 不提供恢复按钮 -->
      <div class="batch-bar">
        <span class="batch-tip">已选 <b>{{ selectedIds.length }}</b> 条</span>
        <el-button
          type="danger"
          plain
          size="small"
          :disabled="selectedIds.length === 0"
          @click="onBatchDelete"
        >
          <el-icon><Delete /></el-icon>
          <span>批量删除</span>
        </el-button>
        <div class="spacer" />
        <el-button :icon="Refresh" size="small" @click="load">刷新</el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="rows"
        border
        stripe
        @selection-change="(rows) => (selectedIds = rows.map((r) => r._id))"
      >
        <el-table-column type="selection" width="48" />
        <el-table-column label="用户" min-width="140">
          <template #default="{ row }">
            <div class="user-cell">
              <el-icon><User /></el-icon>
              <div class="user-info">
                <div class="user-name">{{ row.user?.realName || row.user?.mobile || '-' }}</div>
                <div class="user-mobile muted">{{ row.user?.mobile || '-' }}</div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="公司" min-width="160">
          <template #default="{ row }">
            <div class="org-cell">
              <div class="org-name">{{ row.org?.name || '-' }}</div>
              <div v-if="row.org?.nameAbbreviation" class="org-abbr muted">
                {{ row.org.nameAbbreviation }} · {{ row.org.unicode }}
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="会话标题" min-width="200">
          <template #default="{ row }">
            <div class="title-cell">
              <el-icon><ChatLineRound /></el-icon>
              <span class="title-text" :title="row.title">{{ row.title || '新会话' }}</span>
            </div>
            <div v-if="row.summary" class="summary-text muted" :title="row.summary">
              {{ row.summary }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="消息数" width="90" align="center">
          <template #default="{ row }">
            <el-tag size="small">{{ row.userMessageCount || 0 }} 轮</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="最后消息" width="150">
          <template #default="{ row }">
            <span class="muted">{{ formatTime(row.lastMessageAt || row.updatedAt) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="100" align="center">
          <template #default="{ row }">
            <el-tag
              v-if="row.isDeleted"
              type="danger"
              size="small"
            >
              <el-icon><Delete /></el-icon>
              <span>已删除</span>
            </el-tag>
            <el-tag v-else-if="row.isArchived" type="info" size="small">已归档</el-tag>
            <el-tag v-else type="success" size="small">活跃</el-tag>
          </template>
        </el-table-column>
        <!-- (2026-06-18) 操作列: 只剩 [详情], 不再提供单条恢复 (物理删后不可恢复) -->
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" size="small" @click="openDetail(row)">
              <el-icon><View /></el-icon>
              <span>详情</span>
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-model:current-page="page"
        v-model:page-size="pageSize"
        :total="total"
        :page-sizes="[10, 20, 50, 100]"
        layout="total, sizes, prev, pager, next, jumper"
        class="pagination"
        @current-change="load"
        @size-change="load"
      />
    </el-card>

    <!-- 详情抽屉 (会话信息 + 聊天记录) -->
    <el-drawer
      v-model="detailVisible"
      :title="detailTitle"
      direction="rtl"
      size="720px"
      :destroy-on-close="true"
    >
      <div v-if="detailConv" class="detail-body">
        <!-- 元信息 -->
        <el-descriptions :column="2" border size="small" class="mb">
          <el-descriptions-item label="用户">
            {{ detailConv.user?.realName || '-' }} ({{ detailConv.user?.mobile || '-' }})
          </el-descriptions-item>
          <el-descriptions-item label="公司">
            {{ detailConv.org?.name || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="标题" :span="2">
            {{ detailConv.title || '新会话' }}
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag v-if="detailConv.isDeleted" type="danger" size="small">已删除</el-tag>
            <el-tag v-else-if="detailConv.isArchived" type="info" size="small">已归档</el-tag>
            <el-tag v-else type="success" size="small">活跃</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="消息数">
            {{ detailConv.userMessageCount || 0 }} 轮 / {{ detailConv.messageCount || 0 }} 条
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatTime(detailConv.createdAt) }}
          </el-descriptions-item>
          <el-descriptions-item label="最后消息">
            {{ formatTime(detailConv.lastMessageAt || detailConv.updatedAt) }}
          </el-descriptions-item>
          <el-descriptions-item v-if="detailConv.summary" label="摘要" :span="2">
            {{ detailConv.summary }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- 聊天记录 (按 seq 升序) -->
        <h4 class="chat-section-title">
          聊天记录 ({{ detailConv.messages?.length || 0 }} 条)
        </h4>
        <div class="chat-list">
          <div
            v-for="m in (detailConv.messages || [])"
            :key="m._id"
            class="chat-msg"
            :class="`role-${m.role}`"
          >
            <div class="chat-msg-head">
              <el-tag :type="roleTagType(m.role)" size="small">{{ roleLabel(m.role) }}</el-tag>
              <span class="muted chat-msg-meta">
                #{{ m.seq }} · {{ formatTime(m.createdAt) }}
                <span v-if="m.hasError" style="color: #f56c6c"> · 异常: {{ m.errorMessage }}</span>
              </span>
            </div>
            <div class="chat-msg-body">
              <template v-for="(b, i) in m.content" :key="i">
                <div v-if="b.type === 'text'" class="block-text">{{ b.content }}</div>
                <div v-else-if="b.type === 'file'" class="block-file">
                  <el-icon><Paperclip /></el-icon>
                  <span>{{ b.fileName }} <span class="muted">({{ b.mime }})</span></span>
                </div>
                <div v-else-if="b.type === 'tool_call'" class="block-tool">
                  <b>🔧 {{ b.name }}</b>
                  <span v-if="b.summary" class="muted"> — {{ b.summary }}</span>
                  <el-tag v-if="b.requiresConfirmation" type="warning" size="small">高风险</el-tag>
                  <el-tag v-if="b.status === 'error'" type="danger" size="small">失败</el-tag>
                </div>
                <div v-else-if="b.type === 'tool_result'" class="block-tool">
                  <b>✅ 工具结果: {{ b.toolName }}</b>
                  <span v-if="b.summary" class="muted"> — {{ b.summary }}</span>
                </div>
                <div v-else-if="b.type === 'error'" class="block-error">
                  ❌ {{ b.content }}
                </div>
                <div v-else class="block-other muted">[{{ b.type }}] {{ JSON.stringify(b) }}</div>
              </template>
            </div>
          </div>
        </div>
      </div>
    </el-drawer>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Search,
  Refresh,
  Delete,
  User,
  View,
  ChatLineRound,
  Paperclip
} from '@element-plus/icons-vue'
import { agentApi } from '@/api/agent'

const filters = reactive({
  orgName: '',
  mobile: '',
  isDeleted: undefined,
  dateRange: []
})
const rows = ref([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const loading = ref(false)
const selectedIds = ref([])

const detailVisible = ref(false)
const detailConv = ref(null)

const detailTitle = computed(() => {
  if (!detailConv.value) return '会话详情'
  return `会话详情 · ${detailConv.value.title || '新会话'}`
})

/* ─── 加载 ───────────────────────────────────── */

async function load() {
  loading.value = true
  try {
    const params = {
      page: page.value,
      pageSize: pageSize.value
    }
    if (filters.orgName) params.orgName = filters.orgName
    if (filters.mobile) params.mobile = filters.mobile
    if (filters.isDeleted !== undefined) params.isDeleted = filters.isDeleted
    if (filters.dateRange && filters.dateRange.length === 2) {
      params.startDate = filters.dateRange[0]
      params.endDate = filters.dateRange[1]
    }
    const res = await agentApi.adminListConversations(params)
    rows.value = res.data?.items || []
    total.value = res.data?.total || 0
  } catch (e) {
    ElMessage.error('加载会话列表失败: ' + (e?.message || e))
  } finally {
    loading.value = false
  }
}

function onSearch() {
  page.value = 1
  load()
}

function onReset() {
  filters.orgName = ''
  filters.mobile = ''
  filters.isDeleted = undefined
  filters.dateRange = []
  onSearch()
}

/* ─── 详情 ───────────────────────────────────── */

async function openDetail(row) {
  try {
    const res = await agentApi.adminGetConversation(row._id)
    detailConv.value = res.data
    detailVisible.value = true
  } catch (e) {
    ElMessage.error('加载详情失败: ' + (e?.message || e))
  }
}

/* ─── 批量操作 (2026-06-18 超管) ──────────────── */

/**
 * 批量物理删除
 *  - 走 adminBatchDelete, 后端是 deleteMany (conversations + messages), 不可恢复
 *  - 提示词明确"物理删除, 不可恢复", 避免误操作
 */
async function onBatchDelete() {
  if (selectedIds.value.length === 0) return
  try {
    await ElMessageBox.confirm(
      `确定批量删除 ${selectedIds.value.length} 个会话?\n` +
      `会话和聊天记录会被**物理删除**, 操作不可恢复, 请谨慎!`,
      '批量删除 · 物理删除不可恢复',
      { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
    )
    const res = await agentApi.adminBatchDelete([...selectedIds.value])
    ElMessage.success(
      `已物理删除 ${res.data?.deleted || 0} 个会话 (含 ${res.data?.messagesDeleted || 0} 条消息), 不可恢复`
    )
    selectedIds.value = []
    load()
  } catch (e) {
    if (e !== 'cancel' && e !== 'close') {
      ElMessage.error('删除失败: ' + (e?.message || e))
    }
  }
}

/* ─── 工具 ───────────────────────────────────── */

function formatTime(ts) {
  if (!ts) return '-'
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function roleTagType(role) {
  return { user: 'primary', assistant: 'success', tool: 'info', system: 'warning' }[role] || 'info'
}

function roleLabel(role) {
  return { user: '用户', assistant: 'AI', tool: '工具', system: '系统' }[role] || role
}

onMounted(load)
</script>

<style scoped>
.ai-conv-admin { display: flex; flex-direction: column; gap: 12px; }
.filter-card { padding: 0; }
.filter-card :deep(.el-card__body) { padding-bottom: 0; }
.batch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.batch-tip { font-size: 12px; color: #606266; }
.spacer { flex: 1; }
.pagination { margin-top: 12px; justify-content: flex-end; display: flex; }
.mb { margin-bottom: 12px; }
.muted { color: #909399; font-size: 12px; }

.user-cell { display: flex; align-items: center; gap: 6px; }
.user-info { display: flex; flex-direction: column; }
.user-name { font-size: 13px; color: #303133; }

.org-cell .org-name { font-size: 13px; color: #303133; }

.title-cell { display: flex; align-items: center; gap: 4px; }
.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 240px;
}
.summary-text {
  margin-top: 2px;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

/* 详情抽屉 */
.detail-body { padding: 0 8px 16px; }
.chat-section-title { margin: 12px 0 8px; font-size: 14px; font-weight: 600; }
.chat-list { display: flex; flex-direction: column; gap: 12px; }
.chat-msg {
  border: 1px solid #ebeef5;
  border-radius: 6px;
  padding: 8px 10px;
  background: #fafbfc;
}
.chat-msg.role-user { border-left: 3px solid #409eff; background: #ecf5ff; }
.chat-msg.role-assistant { border-left: 3px solid #67c23a; }
.chat-msg.role-tool { border-left: 3px solid #909399; background: #f4f4f5; }
.chat-msg.role-system { border-left: 3px solid #e6a23c; background: #fdf6ec; }
.chat-msg-head { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.chat-msg-meta { font-size: 11px; }
.chat-msg-body { display: flex; flex-direction: column; gap: 4px; }
.block-text { white-space: pre-wrap; line-height: 1.5; font-size: 13px; }
.block-file, .block-tool, .block-error { font-size: 12px; padding: 2px 0; }
.block-error { color: #f56c6c; }
</style>
