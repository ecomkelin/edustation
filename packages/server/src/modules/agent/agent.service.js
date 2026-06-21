'use strict'

/**
 * AI 助手 - Provider 抽象 + 业务入口
 *
 * 提供方：
 *  - 当前：MiniMax（OpenAI 兼容 chat/completions 协议）
 *  - 后续可加：Anthropic / OpenAI / Ollama，provider 分支即可
 *
 * 三类业务入口：
 *  - chat({messages, systemPrompt?, temperature?, maxTokens?, knowledgeContext?})
 *      非流式，纯文本对话（兼容旧 AiChatTest.vue）
 *  - chatStream({messages, attachments?, tools?, ...})
 *      流式 + tool use 主循环，返回 AsyncIterable
 *  - executeToolDirect({toolName, args, currentUser, orgId, confirmed?})
 *      高风险工具经前端确认后单独执行（不经 LLM 循环）
 *
 * 旧 chat / ping 函数保留向后兼容（AiChatTest.vue 仍可用）
 */

const config = require('@config/index')
const ApiError = require('@utils/ApiError')
const parser = require('./agent.parser')
const executor = require('./agent.executor')

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * 调用 MiniMax chat completions 接口（非流式 / 流式）
 *
 * @returns {Promise<Object>}        非流式: {content, usage, model, latencyMs}
 * @returns {AsyncIterable<Object>}  流式: yield {type:'content', delta} 或 {type:'done', usage, latencyMs}
 */
async function callMiniMax({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 1024,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  stream = false,
  tools = null
}) {
  if (!apiKey) throw ApiError.internal('AI_API_KEY 未配置')
  if (!baseUrl) throw ApiError.internal('AI_BASE_URL 未配置')
  if (!model) throw ApiError.internal('AI_MODEL 未配置')
  if (!Array.isArray(messages) || messages.length === 0) {
    throw ApiError.badRequest('messages 不能为空')
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const startedAt = Date.now()

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream
  }
  if (Array.isArray(tools) && tools.length > 0) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    })
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') throw ApiError.internal(`MiniMax 请求超时 (${timeoutMs}ms)`)
    const cause = e.cause || {}
    const detail = [e.message, cause.code, cause.hostname || cause.address].filter(Boolean).join(' / ')
    throw ApiError.internal(`MiniMax 请求失败: ${detail}`)
  }
  clearTimeout(timer)

  const latencyMs = Date.now() - startedAt

  if (!stream) {
    let json
    try { json = await resp.json() }
    catch (e) { throw ApiError.internal(`MiniMax 响应非 JSON (HTTP ${resp.status})`) }
    if (!resp.ok) {
      const msg = (json && json.error && (json.error.message || json.error.code)) || json?.message || `MiniMax HTTP ${resp.status}`
      throw ApiError.internal(`MiniMax 调用失败: ${msg}`)
    }
    const choice = json.choices && json.choices[0]
    const content = (choice && choice.message && (choice.message.content || '').toString()) || ''
    return { content, usage: json.usage || null, model: json.model || model, latencyMs }
  }

  // 流式: 返回 AsyncIterable
  if (!resp.ok || !resp.body) {
    let errMsg = `MiniMax HTTP ${resp.status}`
    try {
      const txt = await resp.text()
      errMsg += `: ${txt.slice(0, 200)}`
    } catch (_) {}
    throw ApiError.internal(errMsg)
  }
  return iterateSseStream(resp.body, { signal: controller.signal, model, latencyMsStart: startedAt })
}

/**
 * 解析 MiniMax 流式 SSE 字节流, yield {type:'content', delta} 或 {type:'done', usage, latencyMs}
 *
 * MiniMax (OpenAI 兼容) 流格式:
 *   data: {"id":"...","object":"chat.completion.chunk","choices":[{"delta":{"content":"..."},...}]}
 *   data: [DONE]
 */
async function* iterateSseStream(body, { signal, model, latencyMsStart }) {
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  let usage = null
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line.startsWith('data:')) continue
        const payload = line.slice(5).trim()
        if (payload === '[DONE]') {
          yield { type: 'done', usage, latencyMs: Date.now() - latencyMsStart }
          return
        }
        let evt
        try { evt = JSON.parse(payload) } catch (_) { continue }
        // 累积 usage (last-wins, 最后一条 chunk 通常带 usage)
        if (evt.usage) usage = evt.usage
        const delta = evt.choices?.[0]?.delta?.content
        if (delta) {
          yield { type: 'content', delta, model: evt.model || model }
        }
        // OpenAI tool_calls 也在 delta 里累积 (function.name / function.arguments 增量)
        const toolCalls = evt.choices?.[0]?.delta?.tool_calls
        if (toolCalls && toolCalls.length > 0) {
          yield { type: 'tool_calls_delta', delta: toolCalls }
        }
        if (evt.choices?.[0]?.finish_reason) {
          yield { type: 'finish', reason: evt.choices[0].finish_reason }
        }
      }
    }
    yield { type: 'done', usage, latencyMs: Date.now() - latencyMsStart }
  } catch (e) {
    if (e.name === 'AbortError') {
      yield { type: 'aborted', latencyMs: Date.now() - latencyMsStart }
      return
    }
    throw e
  } finally {
    try { reader.releaseLock() } catch (_) {}
  }
}

/* ─── 业务入口 ───────────────────────────────────────── */

/**
 * 非流式 chat (兼容旧 AiChatTest.vue)
 */
async function chat({
  messages,
  systemPrompt,
  temperature,
  maxTokens,
  knowledgeContext
}) {
  const ai = config.ai || {}
  if (!ai.enabled) {
    throw ApiError.internal('AI 客服未启用, 请先在 .env 中配置 AI_API_KEY 并设置 AI_ENABLED=true')
  }
  const finalMessages = buildMessages({ messages, systemPrompt, knowledgeContext })
  const result = await callMiniMax({
    apiKey: ai.apiKey,
    baseUrl: ai.baseUrl,
    model: ai.model,
    messages: finalMessages,
    temperature: typeof temperature === 'number' ? temperature : ai.temperature,
    maxTokens: typeof maxTokens === 'number' ? maxTokens : ai.maxTokens
  })
  return {
    provider: 'MiniMax',
    model: result.model,
    content: result.content,
    usage: result.usage,
    latencyMs: result.latencyMs
  }
}

/**
 * 流式 chat + tool use 主循环
 *
 * 入参:
 *  - messages: [{role, content}] (不含 attachments)
 *  - attachments: [{fileId, fileName, mime}]  (经 parser 拼到 user 消息)
 *  - tools: OpenAI tools 数组 (agent.tools.toOpenAITools())
 *  - systemPrompt / temperature / maxTokens
 *
 * 返回 AsyncIterable<{event, data}>:
 *  - {event:'start', data:{runId, model}}
 *  - {event:'content', data:{delta}}
 *  - {event:'tool_call', data:{id, name, args, summary?, requiresConfirmation?, requiredPermission?}}
 *  - {event:'tool_result', data:{id, name, ok, summary, result | error}}
 *  - {event:'done', data:{usage?, latencyMs?, aborted?}}
 *  - {event:'error', data:{code, message}}
 */
async function* chatStream({
  messages,
  attachments = [],
  tools = [],
  systemPrompt,
  temperature,
  maxTokens,
  currentUser,
  orgId,
  signal,
  conversationId = null
}) {
  const ai = config.ai || {}
  if (!ai.enabled) {
    yield { event: 'error', data: { code: 500, message: 'AI 客服未启用, 请配置 AI_API_KEY 与 AI_ENABLED=true' } }
    return
  }

  const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  // conversationId 由 controller 注入 (通过入参透传)
  yield { event: 'start', data: { runId, model: ai.model, conversationId } }

  // 1. 处理 attachments: 解析后拼到 user message
  let extraParts = []
  let hasImage = false
  if (Array.isArray(attachments) && attachments.length > 0) {
    for (const a of attachments) {
      try {
        const parsed = await parser.parse({ fileId: a.fileId, orgId })
        if (parsed.kind === 'image') {
          hasImage = true
          extraParts.push({
            type: 'image_url',
            image_url: { url: `data:${parsed.mime};base64,${parsed.imageBase64}` }
          })
        } else {
          extraParts.push({
            type: 'text',
            text: `\n\n[附件 ${a.fileName || parsed.originalName || a.fileId}]\n${parsed.text}\n`
          })
        }
      } catch (e) {
        yield { event: 'error', data: { code: 400, message: `解析附件失败 (${a.fileId}): ${e.message}` } }
        return
      }
    }
  }

  // 2. 拼 messages (system + 历轮 + 本轮)
  const baseMessages = []
  const sysParts = []
  if (ai.systemPrompt) sysParts.push(ai.systemPrompt)
  if (systemPrompt) sysParts.push(systemPrompt)
  if (sysParts.length) baseMessages.push({ role: 'system', content: sysParts.join('\n\n') })

  for (const m of (messages || [])) {
    if (!m || !m.role) continue
    if (!['system', 'user', 'assistant', 'tool'].includes(m.role)) continue
    baseMessages.push(m)
  }

  // 本轮 user 消息: 文本 + 附件 parts
  const lastUserIdx = baseMessages.length - 1
  if (lastUserIdx < 0 || baseMessages[lastUserIdx].role !== 'user') {
    if (extraParts.length > 0) {
      baseMessages.push({ role: 'user', content: extraParts.length === 1 && extraParts[0].type === 'text' ? extraParts[0].text : extraParts })
    } else {
      baseMessages.push({ role: 'user', content: '' })
    }
  } else {
    // 把 extraParts 合并到最后一条 user 消息
    const last = baseMessages[lastUserIdx]
    if (typeof last.content === 'string') {
      const textPart = { type: 'text', text: last.content }
      baseMessages[lastUserIdx] = { role: 'user', content: [textPart, ...extraParts] }
    } else if (Array.isArray(last.content)) {
      baseMessages[lastUserIdx] = { role: 'user', content: [...last.content, ...extraParts] }
    } else {
      baseMessages[lastUserIdx] = { role: 'user', content: [last.content, ...extraParts] }
    }
  }

  // 3. 主循环 (最多 6 轮, 防 LLM 死循环)
  const MAX_ITER = 6
  let totalUsage = null
  const toolCallIdCounter = { i: 0 }
  const nextId = () => `call_${toolCallIdCounter.i++}_${Date.now()}`

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const llmStream = await callMiniMax({
      apiKey: ai.apiKey,
      baseUrl: ai.baseUrl,
      model: ai.model,
      messages: baseMessages,
      temperature: typeof temperature === 'number' ? temperature : ai.temperature,
      maxTokens: typeof maxTokens === 'number' ? maxTokens : ai.maxTokens,
      stream: true,
      tools: tools && tools.length > 0 ? tools : null,
      timeoutMs: ai.timeoutMs || DEFAULT_TIMEOUT_MS
    })

    // 累积 LLM 流式输出: content delta + tool_calls 增量
    let contentText = ''
    let toolCallsMap = new Map() // index -> {id, name, args}
    let lastFinishReason = null
    let totalLatency = 0

    for await (const evt of llmStream) {
      if (signal && signal.aborted) {
        yield { event: 'done', data: { aborted: true } }
        return
      }
      if (evt.type === 'content' && evt.delta) {
        contentText += evt.delta
        yield { event: 'content', data: { delta: evt.delta } }
      } else if (evt.type === 'tool_calls_delta' && evt.delta) {
        for (const d of evt.delta) {
          const idx = d.index ?? 0
          if (!toolCallsMap.has(idx)) {
            toolCallsMap.set(idx, { id: d.id || nextId(), name: '', args: '' })
          }
          const cur = toolCallsMap.get(idx)
          if (d.id) cur.id = d.id
          if (d.function?.name) cur.name += d.function.name
          if (d.function?.arguments) cur.args += d.function.arguments
        }
      } else if (evt.type === 'finish') {
        lastFinishReason = evt.reason
      } else if (evt.type === 'done') {
        totalLatency += evt.latencyMs || 0
        if (evt.usage) totalUsage = evt.usage
      } else if (evt.type === 'aborted') {
        yield { event: 'done', data: { aborted: true } }
        return
      }
    }

    // 解析完整 tool_calls
    const toolCalls = Array.from(toolCallsMap.values()).map((tc) => ({
      id: tc.id,
      name: tc.name,
      args: parseToolArgs(tc.args)
    }))

    // 没有 tool_calls → 自然结束
    if (toolCalls.length === 0) {
      yield { event: 'done', data: { usage: totalUsage, latencyMs: totalLatency } }
      return
    }

    // 把 LLM 这轮的 message (含 tool_calls) 写回 messages
    baseMessages.push({
      role: 'assistant',
      content: contentText || null,
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) }
      }))
    })

    // 逐个执行 tool_call
    let abortedForConfirmation = false
    for (const tc of toolCalls) {
      // 先把 tool_call 事件发给前端 (含摘要)
      yield {
        event: 'tool_call',
        data: {
          id: tc.id,
          name: tc.name,
          args: tc.args,
          summary: executor.buildSummary(tc.name, tc.args || {})
        }
      }

      let execResult
      try {
        execResult = await executor.execute({
          toolName: tc.name,
          args: tc.args || {},
          currentUser,
          orgId,
          confirmed: false
        })
      } catch (e) {
        execResult = { ok: false, toolName: tc.name, error: e.message || '执行失败', code: e.code || 500 }
      }

      if (execResult.pendingConfirmation) {
        // 高风险需要前端确认: 把 summary 与 args 一并回前端, 流终止 (避免 LLM 二次串改)
        yield {
          event: 'tool_call',
          data: {
            id: tc.id,
            name: tc.name,
            args: tc.args,
            summary: execResult.summary,
            requiresConfirmation: true,
            requiredPermission: execResult.requiredPermission
          }
        }
        abortedForConfirmation = true
        break
      }

      // 普通结果
      yield {
        event: 'tool_result',
        data: {
          id: tc.id,
          name: tc.name,
          ok: execResult.ok !== false,
          summary: execResult.summary,
          result: execResult.result,
          error: execResult.error
        }
      }

      // 把 tool 消息 push 进 messages 供下一轮 LLM 看
      baseMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(execResult.ok !== false ? execResult.result : { error: execResult.error })
      })
    }

    if (abortedForConfirmation) {
      yield { event: 'done', data: { aborted: 'confirmation_required', usage: totalUsage, latencyMs: totalLatency } }
      return
    }

    // 继续下一轮 LLM
  }

  yield { event: 'done', data: { usage: totalUsage, note: 'max iterations reached' } }
}

/**
 * 高风险工具用户确认后, 单独执行 (不经 LLM 循环)
 */
async function executeToolDirect({ toolName, args, currentUser, orgId, confirmed }) {
  return executor.execute({ toolName, args: args || {}, currentUser, orgId, confirmed: !!confirmed })
}

/* ─── helpers ───────────────────────────────────────── */

function buildMessages({ messages, systemPrompt, knowledgeContext }) {
  const out = []
  const sys = []
  if (systemPrompt) sys.push(systemPrompt)
  if (knowledgeContext) sys.push(knowledgeContext)
  if (sys.length) out.push({ role: 'system', content: sys.join('\n\n') })
  for (const m of (messages || [])) {
    if (!m || typeof m.content !== 'string') continue
    if (!['system', 'user', 'assistant'].includes(m.role)) continue
    out.push({ role: m.role, content: m.content })
  }
  return out
}

function parseToolArgs(s) {
  if (!s) return {}
  if (typeof s === 'object') return s
  try { return JSON.parse(s) } catch (_) { return { _raw: s } }
}

/* ─── ping (连通性测试, 兼容旧 AiChatTest.vue) ───────── */

async function ping() {
  const ai = config.ai || {}
  if (!ai.enabled) return { ok: false, reason: 'AI 客服未启用, 请在 .env 中设置 AI_ENABLED=true 并填入 AI_API_KEY' }
  if (!ai.apiKey) return { ok: false, reason: 'AI_API_KEY 未配置 (请检查 .env)' }
  try {
    const res = await chat({
      messages: [{ role: 'user', content: '你好, 请用一句话介绍你自己。' }],
      maxTokens: 128
    })
    return {
      ok: true,
      provider: 'MiniMax',
      model: res.model,
      latencyMs: res.latencyMs,
      content: res.content,
      usage: res.usage
    }
  } catch (e) {
    const reason = e.message || String(e)
    const hint = /ENOTFOUND|EAI_AGAIN/.test(reason)
      ? `(请检查 AI_BASE_URL 是否正确、当前网络能否访问该域名)`
      : ''
    return { ok: false, reason: reason + hint }
  }
}

module.exports = {
  chat,
  chatStream,
  executeToolDirect,
  ping
}