<template>
  <div class="page ai-chat-page">
    <h2>AI 客服测试</h2>
    <p class="hint">
      本页用于测试 AI 智能客服。当前后端使用 <b>MiniMax</b> 大模型（OpenAI 兼容 chat
      completions 协议）。点击右上角"测试连通性"可验证后端是否已正确配置
      <code>MINIMAX_API_KEY</code> / <code>MINIMAX_BASE_URL</code> / <code>MINIMAX_MODEL</code>。
    </p>

    <!-- 顶部状态条 -->
    <el-card class="status-card" shadow="never">
      <div class="status-row">
        <div class="status-left">
          <el-tag :type="pingState.ok === null ? 'info' : pingState.ok ? 'success' : 'danger'" size="large">
            <el-icon style="vertical-align: middle">
              <component :is="pingState.ok === null ? QuestionFilled : pingState.ok ? CircleCheck : CircleClose" />
            </el-icon>
            <span style="margin-left: 4px">{{ pingState.label }}</span>
          </el-tag>
          <span v-if="pingState.detail" class="status-detail">{{ pingState.detail }}</span>
        </div>
        <div class="status-right">
          <el-button :loading="pingLoading" @click="runPing">
            <el-icon><Connection /></el-icon>
            <span>测试连通性</span>
          </el-button>
          <el-button type="danger" plain :disabled="messages.length === 0" @click="clearConversation">
            <el-icon><Delete /></el-icon>
            <span>清空对话</span>
          </el-button>
        </div>
      </div>
    </el-card>

    <el-row :gutter="16" class="main-row">
      <!-- 左：聊天区 -->
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="chat-card">
          <template #header>
            <div class="chat-header">
              <span>对话窗口</span>
              <span class="chat-meta">
                <el-tag size="small" type="info">模型：{{ lastMeta.model || '—' }}</el-tag>
                <el-tag size="small" type="info" v-if="lastMeta.latencyMs != null">
                  耗时：{{ lastMeta.latencyMs }}ms
                </el-tag>
                <el-tag size="small" type="info" v-if="lastMeta.usage">
                  tokens：{{ lastMeta.usage.total_tokens || ((lastMeta.usage.prompt_tokens || 0) + (lastMeta.usage.completion_tokens || 0)) }}
                </el-tag>
              </span>
            </div>
          </template>

          <div ref="scrollRef" class="chat-body">
            <div v-if="messages.length === 0" class="empty">
              <el-icon size="40" color="#c0c4cc"><ChatLineRound /></el-icon>
              <p>暂无对话，发条消息开始测试吧 👋</p>
              <div class="suggestions">
                <el-button
                  v-for="(q, idx) in presetQuestions"
                  :key="idx"
                  size="small"
                  round
                  @click="usePreset(q)"
                >
                  {{ q }}
                </el-button>
              </div>
            </div>

            <div
              v-for="(m, i) in messages"
              :key="i"
              class="bubble"
              :class="['bubble-' + m.role, m.error ? 'bubble-error' : '']"
            >
              <div class="bubble-role">
                {{ m.role === 'user' ? '我' : m.role === 'assistant' ? 'AI' : 'System' }}
                <span v-if="m.ts" class="bubble-ts">{{ formatTs(m.ts) }}</span>
              </div>
              <div class="bubble-content">{{ m.content }}</div>
            </div>

            <div v-if="sending" class="bubble bubble-assistant">
              <div class="bubble-role">AI <span class="bubble-ts">思考中…</span></div>
              <div class="bubble-content">
                <el-icon class="is-loading"><Loading /></el-icon>
                <span style="margin-left: 6px">正在生成回复</span>
              </div>
            </div>
          </div>

          <div class="chat-input">
            <el-input
              v-model="input"
              type="textarea"
              :rows="3"
              resize="none"
              placeholder="输入消息，Enter 发送，Shift+Enter 换行"
              :disabled="sending"
              @keydown="onKeydown"
            />
            <div class="chat-input-bar">
              <span class="muted">Enter 发送 · Shift+Enter 换行</span>
              <el-button type="primary" :loading="sending" :disabled="!input.trim()" @click="send">
                <el-icon><Promotion /></el-icon>
                <span>发送</span>
              </el-button>
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右：参数 / 上下文 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="settings-card">
          <template #header>
            <span>调用参数</span>
          </template>

          <el-form label-position="top" size="default">
            <el-form-item label="系统提示（system prompt）">
              <el-input
                v-model="systemPrompt"
                type="textarea"
                :rows="5"
                placeholder="可选：临时覆盖后端默认 system prompt"
              />
            </el-form-item>
            <el-form-item label="知识上下文（RAG 占位）">
              <el-input
                v-model="knowledgeContext"
                type="textarea"
                :rows="4"
                placeholder="阶段 3 后期会接向量库；测试阶段可手动粘贴一段知识片段"
              />
            </el-form-item>
            <el-form-item label="Temperature">
              <el-slider v-model="temperature" :min="0" :max="2" :step="0.1" show-input />
            </el-form-item>
            <el-form-item label="Max tokens">
              <el-input-number v-model="maxTokens" :min="64" :max="8000" :step="64" />
            </el-form-item>
            <el-form-item>
              <el-checkbox v-model="appendContext">每轮自动追加上一条 system / 参数设置</el-checkbox>
            </el-form-item>
            <el-form-item>
              <el-button @click="resetParams" plain>恢复默认参数</el-button>
            </el-form-item>
          </el-form>
        </el-card>

        <el-card shadow="never" class="help-card" style="margin-top: 16px">
          <template #header>
            <span>使用说明</span>
          </template>
          <ol class="help-list">
            <li>确保 <code>packages/server/.env</code> 中已设置 <code>AI_ENABLED=true</code> 与 <code>MINIMAX_API_KEY</code>。</li>
            <li>先点 <b>测试连通性</b> 验证后端能调到 MiniMax（绿勾=可用）。</li>
            <li>左下输入框发消息，对话会保留上下文（多轮）。</li>
            <li>右侧可临时改 system prompt / RAG 上下文 / temperature / maxTokens。</li>
            <li>本测试页不写库，所有对话仅前端内存，刷新即丢。</li>
          </ol>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import {
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

// ─── 状态 ──────────────────────────────────────────────
const messages = ref([]) // [{role, content, ts, error?}]
const input = ref('')
const sending = ref(false)
const scrollRef = ref(null)

const systemPrompt = ref('')
const knowledgeContext = ref('')
const temperature = ref(0.7)
const maxTokens = ref(1024)
const appendContext = ref(true)

const defaultParams = () => ({
  systemPrompt: '',
  knowledgeContext: '',
  temperature: 0.7,
  maxTokens: 1024,
  appendContext: true
})

const lastMeta = reactive({ model: '', latencyMs: null, usage: null })
const pingLoading = ref(false)
const pingState = reactive({ ok: null, label: '未测试', detail: '' })

const presetQuestions = [
  '你好，介绍一下你自己',
  '你们机构有什么课程？',
  '如何给孩子报名？',
  '请假了能补课吗？'
]

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
}

function resetParams() {
  const d = defaultParams()
  systemPrompt.value = d.systemPrompt
  knowledgeContext.value = d.knowledgeContext
  temperature.value = d.temperature
  maxTokens.value = d.maxTokens
  appendContext.value = d.appendContext
}

function clearConversation() {
  messages.value = []
  lastMeta.model = ''
  lastMeta.latencyMs = null
  lastMeta.usage = null
  ElMessage.success('已清空')
}

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    if (!sending.value) send()
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
      ElMessage.success('AI 客服连通正常')
    } else {
      pingState.ok = false
      pingState.label = '不可用'
      pingState.detail = (data && data.reason) || '未知原因'
      ElMessage.error('AI 客服不可用，请检查后端 .env 配置')
    }
  } catch (e) {
    pingState.ok = false
    pingState.label = '请求失败'
    pingState.detail = e?.message || String(e)
    ElMessage.error(this?.pingState?.detail || '请求失败')
  } finally {
    pingLoading.value = false
  }
}

async function send() {
  const text = input.value.trim()
  if (!text) return
  // 推入用户消息
  messages.value.push({ role: 'user', content: text, ts: Date.now() })
  input.value = ''
  scrollToBottom()

  // 构造请求 messages：保留所有历史 role/content（与模型保持多轮上下文）
  const reqMessages = messages.value
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }))

  sending.value = true
  try {
    const res = await agentApi.chat({
      messages: reqMessages,
      systemPrompt: appendContext.value ? systemPrompt.value : '',
      knowledgeContext: appendContext.value ? knowledgeContext.value : '',
      temperature: temperature.value,
      maxTokens: maxTokens.value
    })
    const data = res.data || {}
    const reply = data.content || '(空回复)'
    messages.value.push({ role: 'assistant', content: reply, ts: Date.now() })
    lastMeta.model = data.model || ''
    lastMeta.latencyMs = data.latencyMs ?? null
    lastMeta.usage = data.usage || null
  } catch (e) {
    const msg = e?.message || e?.data?.message || '调用失败'
    messages.value.push({ role: 'assistant', content: '❌ ' + msg, ts: Date.now(), error: true })
  } finally {
    sending.value = false
    scrollToBottom()
  }
}

onMounted(() => {
  // 进入页面自动跑一次 ping，省得用户手动点
  runPing()
})
</script>

<style scoped>
.ai-chat-page { display: flex; flex-direction: column; }
.hint { color: #606266; font-size: 13px; margin: 4px 0 12px; line-height: 1.6; }
.hint code { background: #f0f2f5; padding: 0 4px; border-radius: 3px; }

.status-card { margin-bottom: 12px; }
.status-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.status-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.status-detail { color: #909399; font-size: 12px; }
.status-right { display: flex; gap: 8px; }

.main-row { margin-top: 0; }

.chat-card { display: flex; flex-direction: column; height: calc(100vh - 220px); min-height: 540px; }
:deep(.chat-card .el-card__body) { display: flex; flex-direction: column; flex: 1; padding: 12px; min-height: 0; }
.chat-header { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
.chat-meta { display: flex; gap: 6px; flex-wrap: wrap; }

.chat-body {
  flex: 1;
  overflow-y: auto;
  padding: 8px 4px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fafbfc;
  border-radius: 6px;
  border: 1px solid #ebeef5;
}

.empty {
  margin: auto;
  text-align: center;
  color: #909399;
  padding: 32px 16px;
}
.empty p { margin: 8px 0 12px; }
.suggestions { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }

.bubble {
  max-width: 78%;
  padding: 8px 12px;
  border-radius: 8px;
  line-height: 1.55;
  word-break: break-word;
  white-space: pre-wrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.bubble-user { align-self: flex-end; background: #409eff; color: #fff; }
.bubble-assistant { align-self: flex-start; background: #fff; border: 1px solid #ebeef5; }
.bubble-system { align-self: center; background: #f0f2f5; color: #606266; font-size: 12px; }
.bubble-error { border-color: #f56c6c; background: #fef0f0; }
.bubble-role { font-size: 11px; color: #909399; margin-bottom: 4px; }
.bubble-user .bubble-role { color: rgba(255, 255, 255, 0.85); }
.bubble-ts { margin-left: 6px; opacity: 0.7; }
.bubble-content { font-size: 14px; }

.chat-input { margin-top: 12px; }
.chat-input-bar { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
.muted { color: #909399; font-size: 12px; }

.settings-card { height: 100%; }
.help-card .help-list { padding-left: 20px; line-height: 1.8; font-size: 13px; color: #606266; }
.help-card .help-list code { background: #f0f2f5; padding: 0 4px; border-radius: 3px; }
</style>
