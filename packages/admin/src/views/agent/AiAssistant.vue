<template>
  <div class="page ai-assistant-page">
    <PermissionGuard perm="agent.read">
    <h2 class="page-title">
      <el-icon style="vertical-align: middle"><MagicStick /></el-icon>
      AI 助手
    </h2>

    <el-row :gutter="16">
      <!-- 左侧: 聊天区 + 输入框固定底部 -->
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="chat-card">
          <div ref="scrollRef" class="chat-body">
            <!-- 空状态: 仅显示提示, 预设面板挪到右侧 -->
            <div v-if="messages.length === 0" class="empty-tip">
              <el-icon size="40" color="#c0c4cc"><ChatLineRound /></el-icon>
              <p>暂无对话，发条消息开始吧 👋</p>
              <p class="muted">或拖入 Excel / 图片 / PDF 让 AI 帮你解析并办理</p>
            </div>

            <AiMessageBubble
              v-for="(m, i) in messages"
              :key="i"
              :role="m.role"
              :blocks="m.blocks"
              :ts="m.ts"
              :streaming="false"
              @confirm="(block) => confirmHighRisk(i, block)"
            />

            <!-- 流式中: 累积块 -->
            <AiMessageBubble
              v-if="streamingMsg"
              :role="streamingMsg.role"
              :blocks="streamingMsg.blocks"
              :streaming="true"
            />
          </div>

          <!-- 输入区 (固定在聊天卡底部) -->
          <div class="chat-input">
            <AiFileUploader v-model="pendingFiles" />
            <el-input
              v-model="input"
              type="textarea"
              :rows="3"
              resize="none"
              :placeholder="isStreaming ? 'AI 正在生成中…' : '输入消息，Enter 发送，Shift+Enter 换行'"
              :disabled="isStreaming"
              @keydown="onKeydown"
            />
            <div class="chat-input-bar">
              <span class="muted">
                <span v-if="pendingFiles.length > 0">已选 {{ pendingFiles.length }} 个附件 · </span>
                Enter 发送 · Shift+Enter 换行
              </span>
              <el-button type="primary" :loading="isStreaming" :disabled="!canSend" @click="send">
                <el-icon><Promotion /></el-icon>
                <span>发送</span>
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右侧: 助手说明 / 试试这样问 / 调用参数 (从上到下堆叠) -->
      <el-col :xs="24" :md="8" class="right-col">
        <!-- 1) 助手说明 + 连通状态 -->
        <el-card shadow="never" class="status-card">
          <div class="status-header">
            <div class="status-title">
              <el-icon style="vertical-align: middle"><MagicStick /></el-icon>
              <span>AI 助手说明</span>
            </div>
            <p class="hint">
              用自然语言驱动日常业务,或拖入 Excel / 图片 / PDF 让 AI 解析并办理。
              <b style="color: #e6a23c">高风险操作需点确认才执行</b>。
            </p>
          </div>
          <div class="status-row">
            <div class="status-left">
              <el-tag :type="pingState.ok === null ? 'info' : pingState.ok ? 'success' : 'danger'" size="default">
                <el-icon style="vertical-align: middle">
                  <component :is="pingState.ok === null ? QuestionFilled : pingState.ok ? CircleCheck : CircleClose" />
                </el-icon>
                <span style="margin-left: 4px">{{ pingState.label }}</span>
              </el-tag>
              <span v-if="pingState.detail" class="status-detail">{{ pingState.detail }}</span>
              <span v-if="lastMeta.usage" class="status-detail">
                tokens: {{ lastMeta.usage.total_tokens || ((lastMeta.usage.prompt_tokens || 0) + (lastMeta.usage.completion_tokens || 0)) }}
              </span>
            </div>
            <div class="status-right">
              <el-button size="small" :loading="pingLoading" @click="runPing">
                <el-icon><Connection /></el-icon>
                <span>连通</span>
              </el-button>
              <el-button size="small" type="danger" plain :disabled="messages.length === 0 || isStreaming" @click="clearConversation">
                <el-icon><Delete /></el-icon>
                <span>清空</span>
              </el-button>
            </div>
          </div>
        </el-card>

        <!-- 2) 试试这样问 (预设问题面板) -->
        <AiPresetPanel class="preset-card" @pick="usePreset" />

        <!-- 3) 调用参数 -->
        <el-card shadow="never" class="settings-card">
          <template #header><span>调用参数</span></template>
          <el-form label-position="top" size="default">
            <el-form-item label="系统提示（system prompt）">
              <el-input v-model="systemPrompt" type="textarea" :rows="3" placeholder="可选：覆盖后端默认 system prompt" />
            </el-form-item>
            <el-form-item label="Temperature">
              <el-slider v-model="temperature" :min="0" :max="1.5" :step="0.1" show-input />
            </el-form-item>
            <el-form-item label="Max tokens">
              <el-input-number v-model="maxTokens" :min="256" :max="8000" :step="128" />
            </el-form-item>
            <el-form-item>
              <el-button size="small" plain @click="resetParams">恢复默认参数</el-button>
            </el-form-item>
          </el-form>
        </el-card>
      </el-col>
    </el-row>
    </PermissionGuard>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
  MagicStick,
  ChatLineRound,
  CircleCheck,
  CircleClose,
  Connection,
  Delete,
  Loading,
  Promotion,
  QuestionFilled
} from '@element-plus/icons-vue'
import { agentApi } from '@/api/agent'
import { useAgentStream } from '@/composables/useAgentStream'
import PermissionGuard from '@/components/PermissionGuard.vue'

import AiMessageBubble from './components/AiMessageBubble.vue'
import AiToolCallCard from './components/AiToolCallCard.vue'
import AiPresetPanel from './components/AiPresetPanel.vue'
import AiFileUploader from './components/AiFileUploader.vue'

// ─── 状态 ──────────────────────────────────────────────
const messages = ref([]) // [{role, blocks:[{type,...}], ts}]
const input = ref('')
const pendingFiles = ref([])
const scrollRef = ref(null)

const systemPrompt = ref('')
const temperature = ref(0.5)
const maxTokens = ref(2048)

const lastMeta = reactive({ model: '', latencyMs: null, usage: null })
const pingLoading = ref(false)
const pingState = reactive({ ok: null, label: '未测试', detail: '' })

const streamingMsg = ref(null) // 流式累积块

const { start: startStream, isStreaming, stop: stopStream } = useAgentStream()

const canSend = computed(() => !isStreaming.value && (input.value.trim() || pendingFiles.value.length > 0))

// ─── 工具 ──────────────────────────────────────────────
function formatTs(ts) {
  const d = new Date(ts)
  const pad = (n) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function scrollToBottom() {
  nextTick(() => {
    if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight
  })
}

function usePreset(q) {
  input.value = q
  // 自动 focus 输入框（如果存在）
  const el = document.querySelector('.chat-input .el-textarea__inner')
  if (el) el.focus()
}

function resetParams() {
  systemPrompt.value = ''
  temperature.value = 0.5
  maxTokens.value = 2048
}

function clearConversation() {
  messages.value = []
  streamingMsg.value = null
  lastMeta.model = ''
  lastMeta.latencyMs = null
  lastMeta.usage = null
  ElMessage.success('已清空')
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!isStreaming.value && canSend.value) send()
  }
}

// ─── 行为 ──────────────────────────────────────────────
async function runPing() {
  pingLoading.value = true
  pingState.ok = null
  pingState.label = '测试中…'
  pingState.detail = ''
  try {
    const res = await agentApi.ping()
    const data = res.data
    if (data && data.ok) {
      pingState.ok = true
      pingState.label = '连通正常'
      pingState.detail = `provider=${data.provider} · model=${data.model} · ${data.latencyMs}ms`
    } else {
      pingState.ok = false
      pingState.label = '不可用'
      pingState.detail = (data && data.reason) || '未知原因'
    }
  } catch (e) {
    pingState.ok = false
    pingState.label = '请求失败'
    pingState.detail = e?.message || String(e)
  } finally {
    pingLoading.value = false
  }
}

/**
 * 主发送流程: 构造 messages → 调 SSE 流 → 处理事件
 */
async function send() {
  const text = input.value.trim()
  const attachments = pendingFiles.value.map((f) => ({
    fileId: f.fileId,
    fileName: f.fileName,
    mime: f.mime
  }))
  if (!text && attachments.length === 0) return

  // 1) 推入 user 消息
  const userBlocks = []
  if (text) userBlocks.push({ type: 'text', content: text })
  for (const f of pendingFiles.value) {
    userBlocks.push({ type: 'file', fileId: f.fileId, fileName: f.fileName, mime: f.mime, size: f.size })
  }
  messages.value.push({ role: 'user', blocks: userBlocks, ts: Date.now() })

  // 清空输入
  input.value = ''
  pendingFiles.value = []
  scrollToBottom()

  // 2) 构造 LLM messages (历史 user/assistant; tool 角色也保留)
  const llmMessages = messages.value.map((m) => {
    const content = m.blocks
      .filter((b) => b.type === 'text')
      .map((b) => b.content)
      .join('')
    return { role: m.role, content }
  })

  // 3) 准备 streaming 助手消息
  streamingMsg.value = {
    role: 'assistant',
    blocks: [{ type: 'text', content: '' }],
    ts: Date.now()
  }
  scrollToBottom()

  // 4) 调 SSE
  try {
    await startStream({
      messages: llmMessages,
      attachments,
      systemPrompt: systemPrompt.value,
      temperature: temperature.value,
      maxTokens: maxTokens.value,
      onEvent: handleStreamEvent
    })
  } catch (e) {
    // 错误时给 assistant 块追加错误
    if (streamingMsg.value) {
      streamingMsg.value.blocks.push({ type: 'error', content: e.message || '调用失败' })
    } else {
      messages.value.push({
        role: 'assistant',
        blocks: [{ type: 'error', content: e.message || '调用失败' }],
        ts: Date.now()
      })
    }
  } finally {
    // 流结束: 把 streamingMsg 落到 messages
    if (streamingMsg.value && streamingMsg.value.blocks.some((b) => b.content || b.type !== 'text')) {
      messages.value.push(streamingMsg.value)
    }
    streamingMsg.value = null
    scrollToBottom()
  }
}

/**
 * SSE 事件分发
 */
function handleStreamEvent(event, data) {
  switch (event) {
    case 'start':
      lastMeta.model = data.model || ''
      break
    case 'content': {
      // 累积文本到 streamingMsg 的第一个 text 块
      if (!streamingMsg.value) return
      const textBlock = streamingMsg.value.blocks.find((b) => b.type === 'text' && b._editing !== false)
        || streamingMsg.value.blocks[0]
      if (textBlock) textBlock.content = (textBlock.content || '') + data.delta
      scrollToBottom()
      break
    }
    case 'tool_call': {
      if (!streamingMsg.value) return
      // 找到一个可用的 tool_call 块 (先按 id 找; 没有则新建)
      let block = streamingMsg.value.blocks.find((b) => b.type === 'tool_call' && b.id === data.id)
      if (!block) {
        block = {
          type: 'tool_call',
          id: data.id,
          name: data.name,
          args: data.args,
          summary: data.summary,
          status: data.requiresConfirmation ? 'pending' : 'executing',
          requiresConfirmation: !!data.requiresConfirmation,
          requiredPermission: data.requiredPermission
        }
        streamingMsg.value.blocks.push(block)
      } else {
        block.args = data.args
        block.summary = data.summary
      }
      scrollToBottom()
      break
    }
    case 'tool_result': {
      // 把结果写入对应 tool_call 块 (可能在历史消息中也可能在 streamingMsg)
      // 简化: 我们都把 result 写进 streamingMsg 中对应的 tool_call 块
      if (!streamingMsg.value) return
      const block = streamingMsg.value.blocks.find((b) => b.type === 'tool_call' && b.id === data.id)
      if (block) {
        block.result = data.result
        block.status = 'done'
        if (data.error) block.error = data.error
      }
      scrollToBottom()
      break
    }
    case 'done':
      if (data.usage) lastMeta.usage = data.usage
      if (data.latencyMs) lastMeta.latencyMs = data.latencyMs
      break
    case 'error':
      if (streamingMsg.value) {
        streamingMsg.value.blocks.push({ type: 'error', content: data.message || '调用失败' })
      }
      break
  }
}

/**
 * 高风险工具用户在前端确认后, 单独发 POST /agent/execute 真正落库
 */
async function confirmHighRisk(msgIdx, block) {
  if (block.status === 'executing' || block.status === 'confirmed' || block.status === 'done') return
  block.status = 'executing'
  try {
    const res = await agentApi.executeTool({
      toolName: block.name,
      args: block.args,
      confirmed: true
    })
    if (res.data && res.data.ok !== false) {
      block.status = 'done'
      block.result = res.data.result
    } else {
      block.status = 'error'
      block.error = (res.data && res.data.error) || '执行失败'
    }
  } catch (e) {
    block.status = 'error'
    block.error = e?.message || e?.response?.data?.message || '执行失败'
    ElMessage.error(block.error)
  }
}

onMounted(() => {
  runPing()
})
</script>

<style scoped>
.ai-assistant-page { display: flex; flex-direction: column; }
.page-title { margin: 0 0 12px; font-size: 18px; font-weight: 600; }

.hint { color: #606266; font-size: 12px; margin: 4px 0 8px; line-height: 1.6; }

/* 右侧列: 状态卡 + 预设 + 参数 堆叠
   - 与 chat-card 同高 (calc 100vh - 160px)
   - 内容超出时独立滚, 不会把 chat-card 顶高
   - 这样保证 chat-card 的输入框始终固定在视口底部 */
.right-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: calc(100vh - 160px);
  overflow-y: auto;
  /* 自定义滚动条样式 (webkit) */
  scrollbar-width: thin;
}
.right-col > * { margin-bottom: 0 !important; flex-shrink: 0; }

/* 状态卡 (含说明 + 连通状态 + 操作按钮) */
.status-card { display: flex; flex-direction: column; gap: 8px; }
.status-header { display: flex; flex-direction: column; gap: 2px; }
.status-title { display: flex; align-items: center; gap: 6px; font-weight: 600; font-size: 14px; color: #303133; }
.status-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.status-left { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.status-detail { color: #909399; font-size: 11px; }
.status-right { display: flex; gap: 4px; }

/* 聊天卡: 固定为视口高度 - 头/外边距, 确保输入框始终在视口底部位置固定
   - 用 height 而非 min-height: 避免右列太长时把 chat-card 顶高导致页面外层滚动
   - 配合右列 max-height + overflow-y:auto, 两列独立滚, 不互相影响 */
.chat-card {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 160px);
}
:deep(.chat-card .el-card__body) {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 12px;
  min-height: 0;          /* 关键: 允许 chat-body 收缩到 0 高度以便滚动 */
}

.chat-body {
  flex: 1;
  min-height: 0;          /* 关键: 同上, 让 flex 子项正确滚动 */
  overflow-y: auto;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}
.empty-tip {
  margin: auto;
  text-align: center;
  color: #909399;
  padding: 32px 16px;
}
.empty-tip p { margin: 6px 0; }
.muted { color: #909399; font-size: 12px; }

/* 输入区: 固定在聊天卡底部
   - flex-shrink: 0 防止被压缩
   - 不参与滚动, 始终在 chat-card 底部
   - 内容会自然撑高 (e.g. 选择附件后), 但不会改变其"在底部"的位置 */
.chat-input {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;          /* 关键: 不被 chat-body 挤压 */
}
.chat-input-bar { display: flex; justify-content: space-between; align-items: center; }

.settings-card { /* 跟其他右侧卡同等间距 */ }

/* 预设问题卡: 跟其他右侧卡同等间距 */
.preset-card { /* 间距由 .right-col gap 控制 */ }
</style>