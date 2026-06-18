'use strict'

/**
 * AI 助手 Controller
 *
 * 端点:
 *  - GET  /agent/ping         连通性测试 (兼容旧)
 *  - POST /agent/chat         非流式纯文本 (兼容旧)
 *  - GET  /agent/tools        列出可用工具元数据 (前端 AiAssistant.vue 用)
 *  - POST /agent/parse-file   文件解析 (前端 AI 上传后预解析用, 当前由 chatStream 内部调, 保留)
 *  - POST /agent/chat/stream  SSE 流式 chat + tool use
 *  - POST /agent/execute      高风险工具用户确认后单独执行
 */

const s = require('./agent.service')
const parser = require('./agent.parser')
const toolsModule = require('./agent.tools')
const stream = require('./agent.stream')
const ApiResponse = require('@utils/ApiResponse')

/**
 * POST /agent/chat  (兼容旧 AiChatTest.vue)
 */
exports.chat = async (req, res) =>
  res.json(
    ApiResponse.ok(
      await s.chat({
        messages: req.body.messages,
        systemPrompt: req.body.systemPrompt,
        knowledgeContext: req.body.knowledgeContext,
        temperature: req.body.temperature,
        maxTokens: req.body.maxTokens
      })
    )
  )

/**
 * GET /agent/ping
 * 即便失败也以 200 返回 ok=false, 由前端展示原因 (避免 4xx/5xx 弹窗吞掉)
 */
exports.ping = async (req, res) => {
  const result = await s.ping()
  res.json(ApiResponse.ok(result))
}

/**
 * GET /agent/tools
 * 返回所有可用工具的元数据 (前端按 perm 隐藏 + 按类别分组显示)
 */
exports.listTools = async (req, res) => {
  res.json(ApiResponse.ok({ items: toolsModule.listAll() }))
}

/**
 * POST /agent/parse-file
 * Body: { fileId }
 * 返回 { kind, text, rows?, imageBase64?, mime, size, originalName }
 */
exports.parseFile = async (req, res) => {
  const parsed = await parser.parse({ fileId: req.body.fileId, orgId: req.orgId })
  res.json(ApiResponse.ok(parsed))
}

/**
 * POST /agent/chat/stream (核心, SSE 流式)
 *
 * Body: {
 *   messages: [{role, content}],          // 历轮 (system/user/assistant/tool)
 *   attachments: [{fileId, fileName, mime}], // 可选
 *   systemPrompt?: string,
 *   temperature?: number,
 *   maxTokens?: number
 * }
 *
 * 事件流 (SSE):
 *   event: start       data: { runId, model }
 *   event: content     data: { delta }
 *   event: tool_call   data: { id, name, args, summary, requiresConfirmation?, requiredPermission? }
 *   event: tool_result data: { id, name, ok, summary, result | error }
 *   event: done        data: { usage?, latencyMs?, aborted? }
 *   event: error       data: { code, message }
 */
exports.chatStream = async (req, res) => {
  stream.sseInit(res)
  const ac = new AbortController()
  stream.onClientClose(req, () => ac.abort())

  try {
    const aiTools = toolsModule.toOpenAITools()
    const iter = s.chatStream({
      messages: req.body.messages || [],
      attachments: req.body.attachments || [],
      tools: aiTools,
      systemPrompt: req.body.systemPrompt,
      temperature: req.body.temperature,
      maxTokens: req.body.maxTokens,
      currentUser: req.user,
      orgId: req.orgId,
      signal: ac.signal
    })
    for await (const evt of iter) {
      // 客户端断连则终止
      if (ac.signal.aborted) break
      stream.sseWrite(res, evt.event, evt.data)
    }
  } catch (e) {
    try {
      stream.sseWrite(res, 'error', { code: e.code || 500, message: e.message || 'internal error' })
    } catch (_) {}
  } finally {
    stream.sseEnd(res)
  }
}

/**
 * POST /agent/execute
 * 高风险工具经前端用户确认后, 单独执行 (不经 LLM 循环)
 * Body: { toolName, args, confirmed: true }
 */
exports.executeTool = async (req, res) => {
  const result = await s.executeToolDirect({
    toolName: req.body.toolName,
    args: req.body.args || {},
    currentUser: req.user,
    orgId: req.orgId,
    confirmed: req.body.confirmed === true
  })
  res.json(ApiResponse.ok(result))
}