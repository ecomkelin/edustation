<template>
  <div class="page ai-assistant-page">
    <PermissionGuard perm="agent.read">
    <div class="ai-grid">
      <!-- 左侧: 聊天区 + 输入框固定底部 -->
      <div class="left-col">
        <!-- (2026-06-18) 改用 div 自己实现卡片, 避免 el-card 无 header 时 .el-card__body 包裹不生效 -->
        <div class="chat-card">
          <div ref="scrollRef" class="chat-body">
            <!-- 空状态 -->
            <div v-if="messages.length === 0" class="empty-tip">
              <el-icon size="40" color="#c0c4cc"><ChatLineRound /></el-icon>
              <p>{{ activeConversationId ? '本会话暂无消息' : '暂无对话，发条消息开始吧 👋' }}</p>
              <p class="muted">或拖入 Excel / 图片 / PDF 让 AI 帮你解析并办理</p>
            </div>

            <AiMessageBubble
              v-for="(m, i) in messages"
              :key="m._msgId || i"
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
        </div>
      </div>

      <!-- 右侧: AI 助手说明 → 会话记录 → 试试这样问 → 调用参数 (2026-06-18 调整顺序) -->
      <div class="right-col">
        <!-- 1) 助手说明 + 连通状态 (提到最上) -->
        <el-card shadow="never" class="status-card">
          <div class="status-header">
            <div class="status-title">
              <el-icon style="vertical-align: middle"><MagicStick /></el-icon>
              <span>AI 助手说明</span>
            </div>
            <p class="hint">
              用自然语言驱动日常业务，或拖入 Excel / 图片 / PDF 让 AI 解析并办理。
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
            </div>
          </div>
        </el-card>

        <!-- 2) 会话记录 (2026-06-18 调整: 移到 AI 助手说明下方) -->
        <AiConversationList
          ref="convListRef"
          class="conv-list-card"
          :active-id="activeConversationId"
          :is-streaming="isStreaming"
          :active-count="conversationLimit.activeCount"
          :max-allowed="conversationLimit.maxAllowed"
          @pick="onPickConversation"
          @new="onNewConversation"
          @limit="onConversationLimit"
        />

        <!-- 3) 试试这样问 -->
        <AiPresetPanel class="preset-card" @pick="usePreset" />

        <!-- 4) 调用参数 (保持最下, 不常用) -->
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
      </div>
    </div>
    </PermissionGuard>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { useAuthStore } from '@/stores/auth'
import {
  MagicStick,
  ChatLineRound,
  CircleCheck,
  CircleClose,
  Connection,
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
import AiConversationList from './components/AiConversationList.vue'

// ─── 状态 ──────────────────────────────────────────────
// messages 元素结构:
//   { _msgId, role, blocks, ts, _serverSeq? }
// blocks 元素结构: {type:'text'|'file'|'tool_call'|'tool_result'|'error', ...}
const messages = ref([])
const input = ref('')
const pendingFiles = ref([])
const scrollRef = ref(null)
const convListRef = ref(null)

const systemPrompt = ref('')
const temperature = ref(0.5)
const maxTokens = ref(2048)

const lastMeta = reactive({ model: '', latencyMs: null, usage: null })
const pingLoading = ref(false)
const pingState = reactive({ ok: null, label: '未测试', detail: '' })

const streamingMsg = ref(null) // 流式累积块

// 会话状态 (2026-06 新增; 2026-06-18 升级: 不再预建空会话)
const activeConversationId = ref('') // 空 = 新会话(未发过), 由后端 lazy create
const activeConversationTitle = ref('')
const streamingConvId = ref('') // 流中用于持久化绑定的 id
const conversationLimit = reactive({ activeCount: 0, maxAllowed: 30 }) // 30 上限(2026-06-18)

const { start: startStream, isStreaming, stop: stopStream } = useAgentStream()
const auth = useAuthStore() // (2026-06-18) 用于 30 上限超管豁免判断

const canSend = computed(() =>
  !isStreaming.value && (input.value.trim() || pendingFiles.value.length > 0)
)

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

function genMsgId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

function usePreset(q) {
  input.value = q
  const el = document.querySelector('.chat-input .el-textarea__inner')
  if (el) el.focus()
}

function resetParams() {
  systemPrompt.value = ''
  temperature.value = 0.5
  maxTokens.value = 2048
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!isStreaming.value && canSend.value) send()
  }
}

// ─── 会话操作 (2026-06, 2026-06-18 升级) ─────────
/**
 * 开启新会话 (清空当前对话, 不预建空记录)
 *  - 不调 createConversation (那样会产生无聊天记录的空会话, 用户要求"没聊天记录的不该有")
 *  - 由后端在首条消息发送时 lazy create
 *  - 校验 30 上限: 满则提示并拒绝 (普通用户)
 *  - 平台超管不限
 */
async function onNewConversation() {
  if (isStreaming.value) return
  // 上限校验 (前端粗判, 后端是权威)
  if (!auth.isPlatformAdmin && conversationLimit.activeCount >= conversationLimit.maxAllowed) {
    ElMessage.warning(`已达会话上限 (${conversationLimit.maxAllowed} 个), 请先删除一些旧会话`)
    return
  }
  activeConversationId.value = ''
  activeConversationTitle.value = ''
  messages.value = []
  streamingMsg.value = null
  lastMeta.model = ''
  lastMeta.latencyMs = null
  lastMeta.usage = null
  // 通知列表刷新
  convListRef.value?.reload?.()
  // (2026-06-18) 用户反馈 "新会话没反应": 因为不预建空会话, 列表里不会多一项, 用户以为没生效
  // 显式 toast 提示, 让用户知道点击成功 + 引导发首条消息
  ElMessage.success('新会话已开启, 发首条消息开始吧')
}

async function onPickConversation(c) {
  if (isStreaming.value) return
  if (c._id === activeConversationId.value) return
  try {
    const res = await agentApi.getConversation(c._id)
    const conv = res.data
    activeConversationId.value = conv._id
    activeConversationTitle.value = conv.title || '新会话'
    // 把后端的 messages 还原成前端的 messages 格式
    messages.value = (conv.messages || []).map((m) => ({
      _msgId: genMsgId(),
      _serverId: m._id,
      _serverSeq: m.seq,
      role: m.role,
      blocks: m.content || [],
      ts: new Date(m.createdAt).getTime()
    }))
    streamingMsg.value = null
  } catch (e) {
    ElMessage.error('加载会话失败: ' + (e?.message || e))
  }
}

/**
 * (2026-06-18) 同步 active 会话的 title (lazy create 之后, 后端会自动设 title, 前端拉一次拿最新)
 */
async function refreshActiveTitle(conversationId) {
  if (!conversationId) return
  try {
    const res = await agentApi.getConversation(conversationId)
    if (res.data && res.data.title) {
      activeConversationTitle.value = res.data.title
    }
  } catch (_) {
    // 静默: 流已经成功, title 拉不到不影响主体
  }
}

/**
 * (2026-06-18) 子组件透传的上限信息
 */
function onConversationLimit({ activeCount, maxAllowed }) {
  conversationLimit.activeCount = activeCount
  conversationLimit.maxAllowed = maxAllowed
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
 *
 * (2026-06) 会话持久化:
 *  - 发前若 activeConversationId 为空, 通知后端 lazy create (后端 chatStream 入口会建)
 *  - 流中收到 start 事件的 conversationId 即为真实 id, 同步到前端
 *  - 流结束 / 失败 / 高风险暂停, 都由后端自动落库; 前端在流结束后 reload 列表
 */
async function send() {
  const text = input.value.trim()
  const attachments = pendingFiles.value.map((f) => ({
    fileId: f.fileId,
    fileName: f.fileName,
    mime: f.mime
  }))
  if (!text && attachments.length === 0) return

  // (2026-06-18) 新会话 + 30 上限: 若本次是新会话 (activeConversationId 为空) 且非超管, 看是否到上限
  //  - 注意: 此时是"即将发首条消息", 如果有 userMessageCount == 0 的空会话被 UI 漏掉, 也会被一起计入
  //  - 后端是权威, 这里只是粗判, 真正拦截靠后端 409
  if (!activeConversationId.value && !auth.isPlatformAdmin
    && conversationLimit.activeCount >= conversationLimit.maxAllowed) {
    ElMessage.warning(`已达会话上限 (${conversationLimit.maxAllowed} 个), 请先删除一些旧会话`)
    return
  }

  // 1) 推入 user 消息
  const userBlocks = []
  if (text) userBlocks.push({ type: 'text', content: text })
  for (const f of pendingFiles.value) {
    userBlocks.push({ type: 'file', fileId: f.fileId, fileName: f.fileName, mime: f.mime, size: f.size })
  }
  messages.value.push({ _msgId: genMsgId(), role: 'user', blocks: userBlocks, ts: Date.now() })

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
    _msgId: genMsgId(),
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
      conversationId: activeConversationId.value,
      onEvent: handleStreamEvent
    })
  } catch (e) {
    // (2026-06-18) 后端 409: 会话数到上限 (lazy create 触发)
    if (e?.response?.status === 409 || e?.status === 409) {
      ElMessage.error(e?.response?.data?.message || e.message || '已达会话上限')
      // 后端已经回滚了, 移除本地刚 push 的 user 消息
      if (messages.value.length > 0 && messages.value[messages.value.length - 1].role === 'user') {
        messages.value.pop()
      }
      streamingMsg.value = null
      return
    }
    if (streamingMsg.value) {
      streamingMsg.value.blocks.push({ type: 'error', content: e.message || '调用失败' })
    } else {
      messages.value.push({
        _msgId: genMsgId(),
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
    // 刷新会话列表 (可能有新会话) + 上限计数
    convListRef.value?.reload?.()
    refreshConversationLimit()
  }
}

/**
 * (2026-06-18) 拉当前活跃会话数, 用于前端 UI 提示
 */
async function refreshConversationLimit() {
  try {
    const res = await agentApi.listConversations({ limit: 1 })
    if (res.data) {
      conversationLimit.activeCount = res.data.activeCount || 0
      conversationLimit.maxAllowed = res.data.maxAllowed || 30
    }
  } catch (_) {
    // 静默
  }
}

/**
 * SSE 事件分发
 */
function handleStreamEvent(event, data) {
  switch (event) {
    case 'start':
      lastMeta.model = data.model || ''
      // 同步后端真实 conversationId (可能 lazy created)
      if (data.conversationId && !activeConversationId.value) {
        activeConversationId.value = data.conversationId
        streamingConvId.value = data.conversationId
        // 首条 user 消息后, 后端会自动改 title; 这里先取会话详情同步标题
        refreshActiveTitle(data.conversationId)
      } else if (data.conversationId) {
        streamingConvId.value = data.conversationId
      }
      break
    case 'content': {
      if (!streamingMsg.value) return
      const textBlock = streamingMsg.value.blocks.find((b) => b.type === 'text' && b._editing !== false)
        || streamingMsg.value.blocks[0]
      if (textBlock) textBlock.content = (textBlock.content || '') + data.delta
      scrollToBottom()
      break
    }
    case 'tool_call': {
      if (!streamingMsg.value) return
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
        if (data.requiresConfirmation) block.requiresConfirmation = true
      }
      scrollToBottom()
      break
    }
    case 'tool_result': {
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
      confirmed: true,
      conversationId: activeConversationId.value,
      toolCallId: block.id
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
  } finally {
    convListRef.value?.reload?.()
    refreshConversationLimit()
  }
}

onMounted(() => {
  runPing()
  refreshConversationLimit()
})
</script>

<style scoped>
/* (2026-06-18) 整体改用弹性布局, 取消 calc(100vh - 160px) 的硬编码
   - 整体占满 main 高度, el-row 用 flex:1 占满剩余
   - 顶部不再有 "AI 助手" 标题 (2026-06-18 用户反馈: 占空间), 聊天区直接顶到 main 顶部 */
.ai-assistant-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
/* (2026-06-18) 改用 CSS Grid 两列布局, 替换 el-row/el-col 嵌套
   - 高度传递清晰: grid 容器 100% → 两列 100% → 内部 flex 100%
   - 不再受 el-col 默认 box-sizing / padding 影响 */
.ai-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
  gap: 16px;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
}
.left-col { height: 100%; min-height: 0; display: flex; flex-direction: column; }

.hint { color: #606266; font-size: 12px; margin: 4px 0 8px; line-height: 1.6; }

/* 右侧列: 助手说明 / 预设 / 会话记录 / 参数 堆叠
   - 高度 100% 跟随 ai-row, 不再 calc 100vh
   - 内容超出时独立滚, 不会把 chat-card 顶高 */
.right-col {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
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

/* 聊天卡: 改用 div 自己实现 (2026-06-18)
   - 之前用 el-card 无 header 时 .el-card__body 不出现, flex 失效
   - 现在 div 包裹, flex 100% 命中
   - 视觉上模拟 el-card (border + bg) */
.chat-card {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #fff;
  border: 1px solid #ebeef5;
  border-radius: 4px;
  padding: 12px;
  box-sizing: border-box;
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
.preset-card { /* 间距由 .right-col gap 控制 */ }
.conv-list-card { /* 间距由 .right-col gap 控制 */ }
</style>
