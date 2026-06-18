<template>
  <div class="ai-tool-card" :class="statusClass">
    <div class="card-header">
      <el-icon class="tool-icon"><Tools /></el-icon>
      <span class="tool-name">{{ call.name }}</span>
      <el-tag v-if="risk === 'high'" type="danger" size="small">高风险</el-tag>
      <el-tag v-else-if="risk === 'write'" type="warning" size="small">写操作</el-tag>
      <el-tag v-else type="info" size="small">只读</el-tag>
      <el-tag v-if="requiredPermission" type="info" size="small" effect="plain">
        需 {{ requiredPermission }}
      </el-tag>
      <span class="status-tag">
        <el-icon v-if="status === 'executing'" class="is-loading"><Loading /></el-icon>
        <el-icon v-else-if="status === 'confirmed' || status === 'done'"><Check /></el-icon>
        <el-icon v-else-if="status === 'error'"><WarningFilled /></el-icon>
        <span style="margin-left: 4px">{{ statusLabel }}</span>
      </span>
    </div>

    <div class="card-body">
      <div v-if="call.summary" class="summary">{{ call.summary }}</div>

      <!-- 参数表 (折叠展开) -->
      <el-collapse v-model="activeNames">
        <el-collapse-item title="调用参数" name="args">
          <pre class="json">{{ formatJson(call.args) }}</pre>
        </el-collapse-item>
        <el-collapse-item v-if="call.result" title="执行结果" name="result">
          <pre class="json">{{ formatJson(call.result) }}</pre>
        </el-collapse-item>
      </el-collapse>

      <!-- 错误信息 -->
      <div v-if="call.error" class="error-box">
        <el-icon><WarningFilled /></el-icon>
        <span>{{ call.error }}</span>
      </div>
    </div>

    <!-- 高风险需要二次确认 -->
    <div v-if="call.requiresConfirmation && !confirmed && !call.result" class="card-actions">
      <el-popconfirm
        title="确认执行此操作？执行后将写入数据库。"
        confirm-button-text="确认执行"
        cancel-button-text="取消"
        @confirm="$emit('confirm')"
      >
        <template #reference>
          <el-button type="danger" plain size="small" :loading="executing">
            <el-icon><Check /></el-icon>
            <span>确认并执行</span>
          </el-button>
        </template>
      </el-popconfirm>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  Tools,
  Check,
  Loading,
  WarningFilled
} from '@element-plus/icons-vue'

const props = defineProps({
  call: { type: Object, required: true }, // {id, name, args, summary, status, requiresConfirmation, requiredPermission, result, error, risk}
  executing: { type: Boolean, default: false },
  confirmed: { type: Boolean, default: false },
  error: { type: String, default: '' }
})
defineEmits(['confirm'])

const activeNames = ref([])

const risk = computed(() => props.call.risk || 'read')
const requiredPermission = computed(() => props.call.requiredPermission || '')

const status = computed(() => {
  if (props.error) return 'error'
  if (props.call.result) return 'done'
  if (props.call.status === 'confirmed' || props.confirmed) return 'confirmed'
  if (props.call.status === 'executing' || props.executing) return 'executing'
  return 'pending'
})

const statusLabel = computed(() => {
  const map = {
    pending: '待确认',
    executing: '执行中',
    confirmed: '已确认',
    done: '已完成',
    error: '失败'
  }
  return map[status.value] || status.value
})

const statusClass = computed(() => `status-${status.value}`)

function formatJson(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  try { return JSON.stringify(v, null, 2) } catch (_) { return String(v) }
}
</script>

<style scoped>
.ai-tool-card {
  border: 1px solid #e4e7ed;
  border-radius: 6px;
  background: #fafbfc;
  font-size: 13px;
  align-self: flex-start;
  max-width: 100%;
  min-width: 280px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid #ebeef5;
  flex-wrap: wrap;
  background: #fff;
  border-radius: 6px 6px 0 0;
}
.tool-icon { color: #409eff; }
.tool-name {
  font-weight: 600;
  font-family: monospace;
  color: #303133;
}
.status-tag {
  margin-left: auto;
  font-size: 12px;
  color: #606266;
  display: inline-flex;
  align-items: center;
}

.card-body { padding: 8px 12px; }
.summary {
  font-size: 13px;
  color: #303133;
  margin-bottom: 6px;
  line-height: 1.55;
}

.json {
  font-family: monospace;
  font-size: 12px;
  background: #f5f7fa;
  padding: 8px;
  border-radius: 4px;
  margin: 0;
  overflow-x: auto;
  max-height: 240px;
  white-space: pre-wrap;
  word-break: break-word;
}

.error-box {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  font-size: 12px;
  color: #f56c6c;
  margin-top: 8px;
}

.card-actions {
  padding: 8px 12px;
  border-top: 1px solid #ebeef5;
  background: #fff;
  border-radius: 0 0 6px 6px;
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}

/* 状态样式 */
.status-executing { border-color: #e6a23c; }
.status-executing .tool-icon { color: #e6a23c; }

.status-confirmed, .status-done { border-color: #67c23a; background: #f0f9eb; }
.status-confirmed .tool-icon, .status-done .tool-icon { color: #67c23a; }

.status-error { border-color: #f56c6c; background: #fef0f0; }
.status-error .tool-icon { color: #f56c6c; }

.status-pending { /* 默认 */ }
</style>