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
const convSvc = require('./agent.conversation.service')
const parser = require('./agent.parser')
const toolsModule = require('./agent.tools')
const stream = require('./agent.stream')
const ApiError = require('@utils/ApiError')
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

  // (2026-06) 会话持久化: 入口处取/建会话, 流结束 / 失败时落库
  // (2026-06-18) 升级: 传 isPlatformAdmin, 让 30 上限对超管不生效
  let conversationId = req.body.conversationId
  let persistedConv = null
  try {
    persistedConv = await convSvc.getOrCreate({
      userId: req.user.id,
      orgId: req.orgId,
      conversationId,
      isPlatformAdmin: !!req.user.isPlatformAdmin
    })
    conversationId = String(persistedConv._id)
    // 把 conversationId 写回 start 事件, 前端拿到后可继续用
    req._conversationId = conversationId
  } catch (e) {
    // 会话创建失败: 仍然继续流 (不阻断主功能)
    console.warn('[agent.chatStream] conv getOrCreate failed:', e.message)
  }

  // 同步把最新 user 消息落库 (含附件)
  const userBlocks = []
  const lastUserMsg = (req.body.messages || []).filter((m) => m.role === 'user').pop()
  if (lastUserMsg && lastUserMsg.content) {
    if (typeof lastUserMsg.content === 'string') {
      userBlocks.push({ type: 'text', content: lastUserMsg.content })
    } else if (Array.isArray(lastUserMsg.content)) {
      for (const c of lastUserMsg.content) {
        if (typeof c === 'string') userBlocks.push({ type: 'text', content: c })
        else if (c && c.type === 'text') userBlocks.push({ type: 'text', content: c.text || '' })
      }
    }
  }
  for (const a of req.body.attachments || []) {
    userBlocks.push({ type: 'file', fileId: a.fileId, fileName: a.fileName, mime: a.mime, size: a.size || 0 })
  }
  if (conversationId && userBlocks.length > 0) {
    try {
      await convSvc.addUserMessage({ conversationId, userId: req.user.id, orgId: req.orgId, blocks: userBlocks })
    } catch (e) {
      console.warn('[agent.chatStream] persist user message failed:', e.message)
    }
  }

  // 累积 assistant 内容 (流结束一并落库)
  let assistantTextBuf = ''
  let assistantToolCalls = []
  let assistantModel = ''
  let assistantLatencyMs = null
  let assistantUsage = null
  let assistantHasError = false
  let assistantErrorMsg = ''

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
      signal: ac.signal,
      conversationId
    })
    for await (const evt of iter) {
      if (ac.signal.aborted) break
      // 局部变量累积 (供 finally 持久化)
      if (evt.event === 'start') {
        assistantModel = evt.data.model || ''
      } else if (evt.event === 'content') {
        assistantTextBuf += evt.data.delta || ''
      } else if (evt.event === 'tool_call') {
        if (evt.data && evt.data.id) {
          // 同 id 的 tool_call 会重复发 (args 更新 + requiresConfirmation 更新), 只保留最终态
          const idx = assistantToolCalls.findIndex((t) => t.id === evt.data.id)
          const tc = {
            id: evt.data.id,
            name: evt.data.name,
            args: evt.data.args,
            summary: evt.data.summary,
            requiresConfirmation: !!evt.data.requiresConfirmation,
            requiredPermission: evt.data.requiredPermission,
            status: evt.data.requiresConfirmation ? 'pending' : 'executing'
          }
          if (idx >= 0) assistantToolCalls[idx] = tc
          else assistantToolCalls.push(tc)
        }
      } else if (evt.event === 'tool_result') {
        const tc = assistantToolCalls.find((t) => t.id === evt.data.id)
        if (tc) {
          tc.result = evt.data.result
          tc.error = evt.data.error
          tc.summary = evt.data.summary || tc.summary
          tc.status = evt.data.ok === false ? 'error' : 'done'
        }
      } else if (evt.event === 'done') {
        assistantLatencyMs = evt.data.latencyMs || null
        assistantUsage = evt.data.usage || null
        if (evt.data.aborted === 'confirmation_required') {
          // 高风险等待确认, 也算 assistant 已说完当前轮
          assistantTextBuf = assistantTextBuf // 保留
        }
      } else if (evt.event === 'error') {
        assistantHasError = true
        assistantErrorMsg = evt.data.message || '调用失败'
      }
      stream.sseWrite(res, evt.event, evt.data)
    }
  } catch (e) {
    assistantHasError = true
    assistantErrorMsg = e.message || 'internal error'
    try {
      stream.sseWrite(res, 'error', { code: e.code || 500, message: assistantErrorMsg })
    } catch (_) {}
  } finally {
    // 持久化 assistant 消息
    if (conversationId && (assistantTextBuf || assistantToolCalls.length > 0 || assistantHasError)) {
      const blocks = []
      if (assistantTextBuf) blocks.push({ type: 'text', content: assistantTextBuf })
      for (const tc of assistantToolCalls) {
        blocks.push({
          type: 'tool_call',
          id: tc.id,
          name: tc.name,
          args: tc.args,
          summary: tc.summary,
          requiresConfirmation: tc.requiresConfirmation,
          requiredPermission: tc.requiredPermission,
          status: tc.status,
          result: tc.result,
          error: tc.error
        })
      }
      if (assistantHasError && !assistantTextBuf) {
        blocks.push({ type: 'error', content: assistantErrorMsg })
      }
      try {
        await convSvc.addAssistantMessage({
          conversationId,
          userId: req.user.id,
          orgId: req.orgId,
          blocks,
          toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : null,
          hasError: assistantHasError,
          errorMessage: assistantErrorMsg,
          model: assistantModel,
          latencyMs: assistantLatencyMs,
          usage: assistantUsage
        })
      } catch (e) {
        console.warn('[agent.chatStream] persist assistant message failed:', e.message)
      }
    }
    // 把 conversationId 通过最后一条 SSE 事件透传给前端 (作为 conversation_id 字段嵌入 done 事件)
    // 已通过 start 事件后续客户端读流后 state.conversationId 持有; 此处不重发避免协议破坏
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

  // 持久化: 高风险工具用户确认后, 追加 tool_result 消息
  if (req.body.conversationId && result && !result.pendingConfirmation) {
    try {
      const blocks = [{
        type: 'tool_result',
        toolName: result.toolName,
        summary: result.summary,
        result: result.result,
        error: result.error,
        ok: result.ok !== false
      }]
      await convSvc.addToolResultMessage({
        conversationId: req.body.conversationId,
        userId: req.user.id,
        orgId: req.orgId,
        toolCallId: req.body.toolCallId || null,
        content: blocks,
        hasError: !result.ok,
        errorMessage: result.error || ''
      })
    } catch (e) {
      // 持久化失败不影响主响应
      console.warn('[agent.execute] persist tool result failed:', e.message)
    }
  }

  res.json(ApiResponse.ok(result))
}

/* ─── 会话 (conversation) 相关端点 (2026-06) ─────── */

/**
 * GET /agent/conversations
 * 列出当前用户的会话 (默认按 lastMessageAt 倒序, 不含已归档, 不含已软删)
 */
exports.listConversations = async (req, res) => {
  const items = await convSvc.list({
    userId: req.user.id,
    orgId: req.orgId,
    limit: Math.min(parseInt(req.query.limit) || 50, 200),
    includeArchived: req.query.includeArchived === 'true',
    includeDeleted: req.query.includeDeleted === 'true'
  })
  // 附带返回当前活跃会话数 / 上限, 前端用于"新会话"按钮的禁用/提示
  const activeCount = await convSvc.countActiveForUser({
    userId: req.user.id,
    orgId: req.orgId
  })
  res.json(ApiResponse.ok({
    ...items,
    activeCount,
    maxAllowed: convSvc.MAX_CONVERSATIONS_PER_USER
  }))
}

/**
 * POST /agent/conversations
 * 创建空会话 (返回完整 doc)
 *  - 非超管: 30 上限校验
 */
exports.createConversation = async (req, res) => {
  const conv = await convSvc.createEmpty({
    userId: req.user.id,
    orgId: req.orgId,
    title: req.body.title,
    isPlatformAdmin: !!req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(conv))
}

/**
 * GET /agent/conversations/:id
 * 加载会话详情 + 所有 messages
 */
exports.getConversation = async (req, res) => {
  const data = await convSvc.getDetail({
    id: req.params.id,
    userId: req.user.id,
    orgId: req.orgId,
    includeDeleted: req.query.includeDeleted === 'true'
  })
  res.json(ApiResponse.ok(data))
}

/**
 * PATCH /agent/conversations/:id
 * 改 title / summary / isArchived / isPinned
 */
exports.patchConversation = async (req, res) => {
  const conv = await convSvc.patch({
    id: req.params.id,
    userId: req.user.id,
    orgId: req.orgId,
    patch: req.body || {}
  })
  res.json(ApiResponse.ok(conv))
}

/**
 * DELETE /agent/conversations/:id  (2026-06-18: 改为软删)
 * 同步把 messages 软删
 */
exports.deleteConversation = async (req, res) => {
  await convSvc.softRemove({
    id: req.params.id,
    userId: req.user.id,
    orgId: req.orgId
  })
  res.json(ApiResponse.ok({ ok: true }))
}

/**
 * POST /agent/conversations/:id/messages
 * 追加一条消息 (role: user/assistant/tool)
 *
 * 注意: 前端正常流程不会直接调这个端点 (chatStream/executeTool 内部会持久化),
 * 留作: (1) 流中断后补登 (2) 手工导入历史 (3) 调试
 */
exports.addMessage = async (req, res) => {
  const msg = await convSvc.addMessage({
    conversationId: req.params.id,
    userId: req.user.id,
    orgId: req.orgId,
    role: req.body.role,
    content: req.body.content || [],
    toolCalls: req.body.toolCalls || null,
    toolCallId: req.body.toolCallId || null,
    hasError: !!req.body.hasError,
    errorMessage: req.body.errorMessage || ''
  })
  res.json(ApiResponse.ok(msg))
}

/* ─── 平台超管: 跨用户/跨机构会话管理 (2026-06-18) ── */

/**
 * GET /agent/admin/conversations
 * 平台超管分页列出所有会话 (含过滤)
 * Query:
 *  - orgId / userId: 精确过滤
 *  - isDeleted: true|false (不传 = 全部)
 *  - mobile: 模糊匹配用户手机号
 *  - orgName: 模糊匹配机构名/简称/unicode
 *  - startDate / endDate: lastMessageAt 区间
 *  - page / pageSize: 分页 (默认 1/20)
 */
exports.adminListConversations = async (req, res) => {
  if (!req.user.isPlatformAdmin) throw ApiError.forbidden('仅平台超管可访问')
  const result = await convSvc.platformList({
    orgId: req.query.orgId,
    userId: req.query.userId,
    isDeleted: req.query.isDeleted === 'true' ? true : (req.query.isDeleted === 'false' ? false : undefined),
    mobile: req.query.mobile,
    orgName: req.query.orgName,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    page: parseInt(req.query.page) || 1,
    pageSize: Math.min(parseInt(req.query.pageSize) || 20, 200)
  })
  res.json(ApiResponse.ok(result))
}

/**
 * GET /agent/admin/conversations/:id
 * 平台超管: 加载会话详情 (含所有消息, 不受软删过滤)
 */
exports.adminGetConversation = async (req, res) => {
  if (!req.user.isPlatformAdmin) throw ApiError.forbidden('仅平台超管可访问')
  const data = await convSvc.platformGetDetail({ id: req.params.id })
  res.json(ApiResponse.ok(data))
}

/**
 * POST /agent/admin/conversations/batch-delete
 * 平台超管: 批量物理删除 (2026-06-18 用户决策: 超管删 = 不可恢复, 不走软删)
 * Body: { ids: [String] }
 */
exports.adminBatchDelete = async (req, res) => {
  if (!req.user.isPlatformAdmin) throw ApiError.forbidden('仅平台超管可访问')
  const result = await convSvc.platformBatchRemove({ ids: req.body.ids })
  res.json(ApiResponse.ok(result))
}

// (2026-06-18) 移除 adminBatchRestore: 物理删后不可恢复, 平台超管不再提供恢复端点
// 旧的 softRemove / 软删流程只服务于"用户自己删除可 30 天反悔"的场景

/* ─── 平台客服 (support-mode, 2026-07-02 立项 C 端 4 tab 重构) ────────
 *
 * 设计原则:
 *   - 每个家长在每个机构下唯一 1 个"客服助理"永久会话 (meta.supportUser=true)
 *   - 不参与普通会话列表 (conv list 默认过滤掉 meta.supportUser)
 *   - 不受 30 上限约束 (system 永久)
 *   - 单独由前端"消息 tab"顶部 sticky 卡点入
 *
 * 在 chatStream 之外的差异:
 *   - resolveConv 走 findOrCreateSupport (固定身份, 不传 conversationId)
 *   - systemPrompt 默认注入"客服助理"风格 (家长可覆盖)
 *
 * 实现策略 (避免与 chatStream 重复 200+ 行):
 *   - 抽 `runChatStreamSSE(req, res, opts)` 私有 helper (含持久化 + 完整 SSE 循环)
 *   - exports.chatStream 和 exports.support 都用同一个 helper, 只换 resolveConv + systemPrompt
 *   - 第一次重构就放进 controller 顶部 (helper 在 exports.chatStream 之前声明)
 *
 * R-2830 GET /agent/chat/support/history 单独处理 (返历史消息, 不是流)
 * R-2831 POST /agent/chat/support/reset 单独处理 (清消息, 不是流)
 * ──────────────────────────────────────────────────────────────────── */

/**
 * 共用 SSE 流式会话 helper (2026-07-02 抽离,服务于 chatStream + support)
 */
async function runChatStreamSSE(req, res, opts) {
  const { resolveConv, buildSystemPrompt, persistKey } = opts
  stream.sseInit(res)
  const ac = new AbortController()
  stream.onClientClose(req, () => ac.abort())

  let conversationId = req.body.conversationId
  try {
    const conv = await resolveConv()
    conversationId = String(conv._id)
    req._conversationId = conversationId
  } catch (e) {
    // 会话创建/取出失败: 仍然继续流 (不阻断主功能)
    console.warn(`[agent.${persistKey}] resolve conv failed:`, e.message)
  }

  // 端点注入专属 systemPrompt (如 support 客服风格), 仅当请求未指定时
  if (buildSystemPrompt && !req.body.systemPrompt) {
    try {
      req.body.systemPrompt = buildSystemPrompt()
    } catch (e) {
      console.warn(`[agent.${persistKey}] buildSystemPrompt failed:`, e.message)
    }
  }

  // 同步把最新 user 消息落库 (含附件)
  const userBlocks = []
  const lastUserMsg = (req.body.messages || []).filter((m) => m.role === 'user').pop()
  if (lastUserMsg && lastUserMsg.content) {
    if (typeof lastUserMsg.content === 'string') {
      userBlocks.push({ type: 'text', content: lastUserMsg.content })
    } else if (Array.isArray(lastUserMsg.content)) {
      for (const c of lastUserMsg.content) {
        if (typeof c === 'string') userBlocks.push({ type: 'text', content: c.text || '' })
        else if (c && c.type === 'text') userBlocks.push({ type: 'text', content: c.text || '' })
      }
    }
  }
  for (const a of req.body.attachments || []) {
    userBlocks.push({ type: 'file', fileId: a.fileId, fileName: a.fileName, mime: a.mime, size: a.size || 0 })
  }
  if (conversationId && userBlocks.length > 0) {
    try {
      await convSvc.addUserMessage({ conversationId, userId: req.user.id, orgId: req.orgId, blocks: userBlocks })
    } catch (e) {
      console.warn(`[agent.${persistKey}] persist user message failed:`, e.message)
    }
  }

  // 累积 assistant 内容 (流结束一并落库)
  let assistantTextBuf = ''
  let assistantToolCalls = []
  let assistantModel = ''
  let assistantLatencyMs = null
  let assistantUsage = null
  let assistantHasError = false
  let assistantErrorMsg = ''

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
      signal: ac.signal,
      conversationId
    })
    for await (const evt of iter) {
      if (ac.signal.aborted) break
      if (evt.event === 'start') {
        assistantModel = evt.data.model || ''
      } else if (evt.event === 'content') {
        assistantTextBuf += evt.data.delta || ''
      } else if (evt.event === 'tool_call') {
        if (evt.data && evt.data.id) {
          const idx = assistantToolCalls.findIndex((t) => t.id === evt.data.id)
          const tc = {
            id: evt.data.id,
            name: evt.data.name,
            args: evt.data.args,
            summary: evt.data.summary,
            requiresConfirmation: !!evt.data.requiresConfirmation,
            requiredPermission: evt.data.requiredPermission,
            status: evt.data.requiresConfirmation ? 'pending' : 'executing'
          }
          if (idx >= 0) assistantToolCalls[idx] = tc
          else assistantToolCalls.push(tc)
        }
      } else if (evt.event === 'tool_result') {
        const tc = assistantToolCalls.find((t) => t.id === evt.data.id)
        if (tc) {
          tc.result = evt.data.result
          tc.error = evt.data.error
          tc.summary = evt.data.summary || tc.summary
          tc.status = evt.data.ok === false ? 'error' : 'done'
        }
      } else if (evt.event === 'done') {
        assistantLatencyMs = evt.data.latencyMs || null
        assistantUsage = evt.data.usage || null
        if (evt.data.aborted === 'confirmation_required') {
          assistantTextBuf = assistantTextBuf // 保留
        }
      } else if (evt.event === 'error') {
        assistantHasError = true
        assistantErrorMsg = evt.data.message || '调用失败'
      }
      stream.sseWrite(res, evt.event, evt.data)
    }
  } catch (e) {
    assistantHasError = true
    assistantErrorMsg = e.message || 'internal error'
    try {
      stream.sseWrite(res, 'error', { code: e.code || 500, message: assistantErrorMsg })
    } catch (_) {}
  } finally {
    if (conversationId && (assistantTextBuf || assistantToolCalls.length > 0 || assistantHasError)) {
      const blocks = []
      if (assistantTextBuf) blocks.push({ type: 'text', content: assistantTextBuf })
      for (const tc of assistantToolCalls) {
        blocks.push({
          type: 'tool_call',
          id: tc.id, name: tc.name, args: tc.args, summary: tc.summary,
          requiresConfirmation: tc.requiresConfirmation, requiredPermission: tc.requiredPermission,
          status: tc.status, result: tc.result, error: tc.error
        })
      }
      if (assistantHasError && !assistantTextBuf) blocks.push({ type: 'error', content: assistantErrorMsg })
      try {
        await convSvc.addAssistantMessage({
          conversationId, userId: req.user.id, orgId: req.orgId, blocks,
          toolCalls: assistantToolCalls.length > 0 ? assistantToolCalls : null,
          hasError: assistantHasError, errorMessage: assistantErrorMsg,
          model: assistantModel, latencyMs: assistantLatencyMs, usage: assistantUsage
        })
      } catch (e) {
        console.warn(`[agent.${persistKey}] persist assistant message failed:`, e.message)
      }
    }
    stream.sseEnd(res)
  }
}

/**
 * 平台客服 systemPrompt (2026-07-02 立项)
 */
function buildSupportSystemPrompt(req) {
  // req.orgName 由前端 header 透传 (orgContext middleware 已在 cookie/header 注入);这里兜底
  const orgName = (req && req.orgName) || '本校'
  return [
    `你是「${orgName} · 客服助理」，负责回答家长关于课程、孩子学习情况和本校招生信息的问题。`,
    '你可以访问该家长在本校的订单、孩子、作品、考勤等数据，**通过 tool use 读取**，**禁止编造**不在工具返回值中的细节。',
    '回答风格：',
    '1. 简洁中文，亲切自然',
    '2. 涉及孩子具体数据时必须引用对应 tool 的返回值',
    '3. 如果家长问的问题超出权限或没有数据，坦率说明并引导其联系教务老师',
    '4. 严禁在回复中透露其他家庭或孩子的信息',
    '5. 不回答与本校业务无关的外部问题（如股市、天气）'
  ].join('\n')
}

/**
 * R-2830 POST /agent/chat/support (2026-07-02 立项)
 * 平台客服专用 SSE 流式入口: 每个家长登入后看到的就是 1 个"客服助手"会话。
 * 与普通 chat/stream (R-2803) 的差别仅是 resolveConv + 系统提示注入。
 */
exports.support = async (req, res) => runChatStreamSSE(req, res, {
  resolveConv: () => convSvc.findOrCreateSupport({
    userId: req.user.id, orgId: req.orgId,
    isPlatformAdmin: !!req.user.isPlatformAdmin
  }),
  buildSystemPrompt: () => buildSupportSystemPrompt(req),
  persistKey: 'support'
})

/**
 * R-2832 GET /agent/chat/support/history
 * 拉取 support 会话的历史消息 (按 seq 升序),无 support 会话时返 { conversation: null, messages: [] }
 */
exports.supportHistory = async (req, res) => {
  const data = await convSvc.getSupportHistory({
    userId: req.user.id, orgId: req.orgId
  })
  res.json(ApiResponse.ok(data))
}

/**
 * R-2831 POST /agent/chat/support/reset
 * 清空 support 会话的全部消息 (软删),保留 conversation 行 (下次点开"AI 客服"还是同一个会话)
 */
exports.supportReset = async (req, res) => {
  const data = await convSvc.resetSupport({
    userId: req.user.id, orgId: req.orgId
  })
  res.json(ApiResponse.ok(data))
}