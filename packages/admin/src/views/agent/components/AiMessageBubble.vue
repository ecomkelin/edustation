<template>
  <div class="ai-message-bubble" :class="['bubble-' + role]">
    <!-- 头部: 角色 + 时间 -->
    <div class="bubble-header">
      <span class="role">{{ roleLabel }}</span>
      <span class="ts" v-if="ts">{{ formatTs(ts) }}</span>
    </div>

    <!-- 内容区: 渲染 blocks 数组 -->
    <div class="bubble-body">
      <template v-for="(b, i) in blocks" :key="i">
        <!-- 文本块 (markdown) -->
        <div v-if="b.type === 'text'" class="block-text">
          <MarkdownView v-if="b.content" :markdown="b.content" />
        </div>

        <!-- 文件块 (用户附件缩略图) -->
        <div v-else-if="b.type === 'file'" class="block-file">
          <el-icon class="file-icon">
            <component :is="iconForMime(b.mime)" />
          </el-icon>
          <span class="file-name" :title="b.fileName">{{ b.fileName }}</span>
          <el-tag size="small" type="info">{{ formatSize(b.size) }}</el-tag>
        </div>

        <!-- 工具调用块 (委托给 AiToolCallCard) -->
        <AiToolCallCard
          v-else-if="b.type === 'tool_call'"
          :call="b"
          :executing="b.status === 'executing'"
          :confirmed="b.status === 'confirmed' || b.status === 'done'"
          :error="b.error"
          @confirm="() => $emit('confirm', b)"
        />

        <!-- 工具结果块 (已执行后的简要结果) -->
        <div v-else-if="b.type === 'tool_result'" class="block-tool-result">
          <el-icon><Check /></el-icon>
          <span class="text">{{ b.summary }}</span>
        </div>

        <!-- 错误块 -->
        <div v-else-if="b.type === 'error'" class="block-error">
          <el-icon><WarningFilled /></el-icon>
          <span>{{ b.content }}</span>
        </div>

        <!-- 文件块 (附件 url 缩略图) -->
        <div v-else-if="b.type === 'image'" class="block-image">
          <el-image
            :src="b.url"
            :preview-src-list="[b.url]"
            fit="cover"
            style="max-width: 240px; max-height: 160px; border-radius: 4px"
          />
        </div>
      </template>

      <!-- 思考中 (assistant 正在流式生成) -->
      <div v-if="role === 'assistant' && streaming" class="block-streaming">
        <el-icon class="is-loading"><Loading /></el-icon>
        <span style="margin-left: 6px">正在生成...</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import MarkdownView from '@/components/MarkdownView.vue'
import AiToolCallCard from './AiToolCallCard.vue'
import {
  Check,
  Loading,
  WarningFilled,
  Picture,
  Document,
  VideoCamera,
  Headset
} from '@element-plus/icons-vue'

const props = defineProps({
  role: { type: String, default: 'user' }, // user / assistant
  blocks: { type: Array, default: () => [] }, // [{type, ...}]
  ts: { type: Number, default: 0 },
  streaming: { type: Boolean, default: false }
})
defineEmits(['confirm'])

const roleLabel = computed(() => {
  if (props.role === 'user') return '我'
  if (props.role === 'assistant') return 'AI'
  if (props.role === 'system') return 'System'
  return props.role
})

function formatTs(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function iconForMime(mime) {
  if (!mime) return Document
  if (mime.startsWith('image/')) return Picture
  if (mime.startsWith('video/')) return VideoCamera
  if (mime.startsWith('audio/')) return Headset
  return Document
}

function formatSize(n) {
  if (!n) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`
  return `${(n / 1024 / 1024).toFixed(2)}MB`
}
</script>

<style scoped>
.ai-message-bubble {
  padding: 10px 14px;
  border-radius: 8px;
  line-height: 1.55;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
  max-width: 86%;
  word-break: break-word;
}

.bubble-user {
  align-self: flex-end;
  background: #409eff;
  color: #fff;
}
.bubble-user .bubble-header { color: rgba(255, 255, 255, 0.85); }
.bubble-user .block-file { background: rgba(255, 255, 255, 0.15); border: 1px solid rgba(255, 255, 255, 0.2); }

.bubble-assistant {
  align-self: flex-start;
  background: #fff;
  border: 1px solid #ebeef5;
}

.bubble-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: #909399;
  margin-bottom: 6px;
}
.role { font-weight: 600; }
.ts { opacity: 0.7; margin-left: 8px; }

.bubble-body { display: flex; flex-direction: column; gap: 8px; }

.block-text {
  font-size: 14px;
  /* MarkdownView 自带样式 */
}

.block-file {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f5f7fa;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  font-size: 13px;
  align-self: flex-start;
  max-width: 100%;
}
.file-icon { color: #606266; }
.file-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.block-tool-result {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: #f0f9eb;
  border: 1px solid #e1f3d8;
  border-radius: 4px;
  font-size: 13px;
  color: #67c23a;
  align-self: flex-start;
}

.block-error {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: #fef0f0;
  border: 1px solid #fde2e2;
  border-radius: 4px;
  font-size: 13px;
  color: #f56c6c;
}

.block-streaming {
  display: inline-flex;
  align-items: center;
  font-size: 13px;
  color: #909399;
}
</style>