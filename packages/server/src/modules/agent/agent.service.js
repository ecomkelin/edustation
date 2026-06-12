'use strict'

const config = require('@config/index')
const ApiError = require('@utils/ApiError')

/**
 * AI 智能客服 —— 提供商实现（Provider）。
 *
 * 当前内置实现：MiniMax（MiniMax 大模型），
 * 走 OpenAI 兼容 chat completions 协议。
 * 后续如需切换 Anthropic / OpenAI / 本地 Ollama，再加 provider 分支即可。
 */

const DEFAULT_TIMEOUT_MS = 60_000

/**
 * 调用 MiniMax chat completions 接口。
 *
 * @param {Object} params
 * @param {string} params.apiKey
 * @param {string} params.baseUrl   e.g. https://api.MiniMax.cn/v1
 * @param {string} params.model     e.g. MiniMax-M3
 * @param {Array<{role:string,content:string}>} params.messages
 * @param {number} [params.temperature=0.7]
 * @param {number} [params.maxTokens=1024]
 * @param {number} [params.timeoutMs]
 *
 * @returns {Promise<{content:string, usage:Object, raw:Object}>}
 */
async function callMiniMax({
  apiKey,
  baseUrl,
  model,
  messages,
  temperature = 0.7,
  maxTokens = 1024,
  timeoutMs = DEFAULT_TIMEOUT_MS
}) {
  if (!apiKey) throw ApiError.internal('MINIMAX_API_KEY 未配置')
  if (!baseUrl) throw ApiError.internal('MINIMAX_BASE_URL 未配置')
  if (!model) throw ApiError.internal('MINIMAX_MODEL 未配置')
  if (!Array.isArray(messages) || messages.length === 0) {
    throw ApiError.badRequest('messages 不能为空')
  }

  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  const startedAt = Date.now()

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
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false
      }),
      signal: controller.signal
    })
  } catch (e) {
    clearTimeout(timer)
    if (e.name === 'AbortError') {
      throw ApiError.internal(`MiniMax 请求超时（${timeoutMs}ms）`)
    }
    // 把底层 cause（ENOTFOUND / ECONNREFUSED / CERT_…）也带出来，
    // 方便区分"域名拼错"和"key 错"和"网络层问题"
    const cause = e.cause || {}
    const detail = [e.message, cause.code, cause.hostname || cause.address]
      .filter(Boolean)
      .join(' / ')
    throw ApiError.internal(`MiniMax 请求失败: ${detail}`)
  }
  clearTimeout(timer)

  const latencyMs = Date.now() - startedAt

  let body
  try {
    body = await resp.json()
  } catch (e) {
    throw ApiError.internal(`MiniMax 响应非 JSON (HTTP ${resp.status})`)
  }

  if (!resp.ok) {
    const msg =
      (body && body.error && (body.error.message || body.error.code)) ||
      body?.message ||
      `MiniMax HTTP ${resp.status}`
    throw ApiError.internal(`MiniMax 调用失败: ${msg}`)
  }

  const choice = body.choices && body.choices[0]
  const content =
    (choice && choice.message && (choice.message.content || '').toString()) || ''

  return {
    content,
    usage: body.usage || null,
    model: body.model || model,
    latencyMs,
    raw: body
  }
}

/**
 * chat 业务入口。负责：
 *  - 从 config 读取供应商配置
 *  - 注入 system prompt（机构 + 上下文）
 *  - 调用供应商
 *  - 返回统一结构
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
    throw ApiError.internal('AI 客服未启用，请先在 .env 中配置 MINIMAX_API_KEY 并设置 AI_ENABLED=true')
  }

  const finalMessages = []
  const sys = []
  if (ai.systemPrompt) sys.push(ai.systemPrompt)
  if (systemPrompt) sys.push(systemPrompt)
  if (knowledgeContext) sys.push(knowledgeContext)
  if (sys.length) {
    finalMessages.push({ role: 'system', content: sys.join('\n\n') })
  }
  for (const m of messages) {
    if (!m || typeof m.content !== 'string') continue
    if (!['system', 'user', 'assistant'].includes(m.role)) continue
    finalMessages.push({ role: m.role, content: m.content })
  }

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
 * 简单连通性测试：不带任何上下文，只问模型"你是谁"。
 * 用于管理后台「AI 客服测试」页验证 key/baseUrl/model 是否可用。
 */
async function ping() {
  const ai = config.ai || {}
  if (!ai.enabled) {
    return {
      ok: false,
      reason: 'AI 客服未启用，请在 .env 中设置 AI_ENABLED=true 并填入 MINIMAX_API_KEY'
    }
  }
  if (!ai.apiKey) {
    return { ok: false, reason: 'MINIMAX_API_KEY 未配置（请检查 .env）' }
  }
  try {
    const res = await chat({
      messages: [{ role: 'user', content: '你好，请用一句话介绍你自己。' }],
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
    // ENOTFOUND 通常意味着 baseUrl 写错或网络受限，给一句可执行提示
    const hint = /ENOTFOUND|EAI_AGAIN/.test(reason)
      ? `（请检查 MINIMAX_BASE_URL 是否正确、当前网络能否访问该域名）`
      : ''
    return { ok: false, reason: reason + hint }
  }
}

module.exports = { chat, ping }
