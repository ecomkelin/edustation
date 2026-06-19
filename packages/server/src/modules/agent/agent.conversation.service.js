'use strict'

/**
 * AI 助手 - 会话 service
 *
 * 职责:
 *  - 会话 CRUD (list / create / get / patch / softRemove / hardRemove)
 *  - 消息持久化 (addMessage / addToolResultMessage)
 *  - 维护会话的统计字段 (messageCount / lastMessageAt / lastUserMessageAt / toolCallCount)
 *  - 标题/摘要更新 (首条 user 消息 → title; 周期 → summary)
 *
 * 鉴权约定:
 *  - 所有 list/get/patch/softRemove 都强校验 user + org, 别人的会话不可见
 *  - 软删后: 非超管看不到; 超管可在平台面板看 (用于运营/合规审计)
 *  - 持久化时 currentUser 必须传入 (从 controller 的 req.user 透传)
 *
 * 不做的事:
 *  - 不存 attachments 原始 buffer (由 storage.files 持有, fileId 引用)
 *  - 不存 LLM raw response (留 conversation 末次 usage 兜底)
 *  - 不调 LLM 生成摘要 (MVP 阶段: summary 由首条 user 消息 200 字截断兜底)
 *
 * (2026-06-18) 升级:
 *  - 加 isDeleted 软删字段 (AgentConversation + AgentMessage 同步)
 *  - 加 MAX_CONVERSATIONS_PER_USER = 30 限制 (非超管)
 *  - 加平台超管查询: 跨 org/跨 user 查/批量软删
 */

const AgentConversation = require('@models/AgentConversation.model')
const AgentMessage = require('@models/AgentMessage.model')
const ApiError = require('@utils/ApiError')

const MAX_TITLE_LEN = 32
const MAX_SUMMARY_LEN = 200
const SUMMARY_MIN_INTERVAL_MS = 60_000 // 摘要更新最小间隔 (1 分钟), 避免高频重算
const MAX_CONVERSATIONS_PER_USER = 30 // 非超管单用户会话上限

/* ─── 列表 (非超管: 默认排除软删) ──────────── */

async function list({ userId, orgId, limit = 50, includeArchived = false, includeDeleted = false }) {
  const filter = { user: userId, org: orgId }
  if (!includeArchived) filter.isArchived = { $ne: true }
  if (!includeDeleted) filter.isDeleted = { $ne: true }
  // (2026-06-18) 置顶的会话排最前: isPinned desc → lastMessageAt desc
  //  - 用聚合管道方式排序需要改写, 这里直接 sort: isPinned=true 排第一靠 { isPinned: -1 } 即可
  const items = await AgentConversation.find(filter)
    .sort({ isPinned: -1, lastMessageAt: -1, updatedAt: -1 })
    .limit(Math.min(limit, 200))
    .lean()
  return { items }
}

/**
 * 数当前活跃会话数 (排除软删), 用于创建前判定是否到上限
 */
async function countActiveForUser({ userId, orgId }) {
  return AgentConversation.countDocuments({
    user: userId,
    org: orgId,
    isDeleted: { $ne: true }
  })
}

/* ─── 创建空会话 (带上限校验) ────────────────── */

/**
 * 创建一个空会话 (无消息), 用于"新会话"按钮
 * - 非超管: 同 userId+orgId 下未软删的会话 >= 30 → 拒 (409)
 * - 超管: 不限
 */
async function createEmpty({ userId, orgId, title, isPlatformAdmin = false }) {
  if (!isPlatformAdmin) {
    const cnt = await countActiveForUser({ userId, orgId })
    if (cnt >= MAX_CONVERSATIONS_PER_USER) {
      throw ApiError.conflict(
        `已达会话上限 (${MAX_CONVERSATIONS_PER_USER} 个), 请先删除一些旧会话再新建`,
        { max: MAX_CONVERSATIONS_PER_USER, current: cnt }
      )
    }
  }
  const doc = await AgentConversation.create({
    org: orgId,
    user: userId,
    title: title || '新会话',
    messageCount: 0,
    userMessageCount: 0,
    toolCallCount: 0,
    firstMessageAt: null,
    lastMessageAt: Date.now()
  })
  return doc.toObject()
}

/**
 * 取或创建 (lazy create):
 *  - 提供 conversationId 时: 校验归属; 找不到/非本人 → 抛 404
 *  - 不提供 conversationId 时: 创建一个空会话, 后续消息会自动续上
 *  - 同样受 30 上限约束 (非超管)
 */
async function getOrCreate({ userId, orgId, conversationId, title, isPlatformAdmin = false }) {
  if (!conversationId) return createEmpty({ userId, orgId, title, isPlatformAdmin })
  const doc = await AgentConversation.findOne({
    _id: conversationId,
    user: userId,
    org: orgId,
    isDeleted: { $ne: true } // 已软删 → 当作不存在
  })
  if (!doc) throw ApiError.notFound('会话不存在或无权限')
  return doc.toObject ? doc.toObject() : doc
}

/* ─── 详情 (含 messages) ─────────────────────── */

async function getDetail({ id, userId, orgId, includeDeleted = false }) {
  const filter = { _id: id, user: userId, org: orgId }
  if (!includeDeleted) filter.isDeleted = { $ne: true }
  const conv = await AgentConversation.findOne(filter).lean()
  if (!conv) throw ApiError.notFound('会话不存在或无权限')
  const messages = await AgentMessage.listByConversation({
    conversationId: id,
    userId,
    orgId,
    includeDeleted
  })
  return { ...conv, messages }
}

/* ─── 更新 (标题/摘要/置顶/归档) ──────────────── */

async function patch({ id, userId, orgId, patch: p }) {
  const allowed = ['title', 'summary', 'isArchived', 'isPinned']
  const update = {}
  for (const k of allowed) {
    if (p[k] !== undefined) update[k] = p[k]
  }
  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest('无有效字段')
  }
  if (update.summary) update.summaryUpdatedAt = new Date()

  const doc = await AgentConversation.findOneAndUpdate(
    { _id: id, user: userId, org: orgId, isDeleted: { $ne: true } },
    { $set: update },
    { new: true, runValidators: true }
  ).lean()
  if (!doc) throw ApiError.notFound('会话不存在或无权限')
  return doc
}

/* ─── 软删 (本人) ────────────────────────────── */
/**
 * 本人软删: isDeleted=true, deletedAt=now, deletedBy='user'
 * 同步把 messages 也打软删标记
 */
async function softRemove({ id, userId, orgId }) {
  const conv = await AgentConversation.findOne({
    _id: id,
    user: userId,
    org: orgId,
    isDeleted: { $ne: true }
  })
  if (!conv) throw ApiError.notFound('会话不存在或无权限')
  const now = new Date()
  await AgentMessage.updateMany(
    { conversation: id, user: userId, org: orgId, isDeleted: { $ne: true } },
    { $set: { isDeleted: true, deletedAt: now } }
  )
  await AgentConversation.updateOne(
    { _id: id },
    { $set: { isDeleted: true, deletedAt: now, deletedBy: 'user' } }
  )
  return { ok: true }
}

/* ─── 平台超管: 跨用户/跨机构查询 + 批量软删 ─── */

/**
 * 平台超管: 跨用户/跨机构分页列出所有会话
 *  - 可按 orgId / userId / isDeleted / 时间范围过滤
 *  - 默认按 lastMessageAt desc
 *  - 返回 items + total
 */
async function platformList({
  orgId,
  userId,
  isDeleted,
  mobile,
  orgName,
  startDate,
  endDate,
  page = 1,
  pageSize = 20
} = {}) {
  const filter = {}
  if (orgId) filter.org = orgId
  if (userId) filter.user = userId
  if (isDeleted === true) filter.isDeleted = true
  else if (isDeleted === false) filter.isDeleted = { $ne: true }
  // else: 不过滤

  if (startDate || endDate) {
    filter.lastMessageAt = {}
    if (startDate) filter.lastMessageAt.$gte = new Date(startDate)
    if (endDate) filter.lastMessageAt.$lte = new Date(endDate)
  }

  let q = AgentConversation.find(filter).sort({ lastMessageAt: -1, _id: -1 })
  const total = await AgentConversation.countDocuments(filter)
  const items = await q
    .populate({ path: 'user', select: 'mobile realName' })
    .populate({ path: 'org', select: 'unicode name nameAbbreviation' })
    .lean()

  // 客户端模糊筛选 mobile / orgName (用 populate 后的字段 in-memory 过滤)
  // 注意: total 也要按过滤后数,保持分页一致
  let filtered = items
  if (mobile) {
    const kw = String(mobile).trim()
    if (kw) filtered = filtered.filter((c) => String(c.user?.mobile || '').includes(kw))
  }
  if (orgName) {
    const kw = String(orgName).trim()
    if (kw) filtered = filtered.filter((c) => {
      const n = c.org || {}
      return [n.name, n.nameAbbreviation, n.unicode].filter(Boolean).some((s) => s.includes(kw))
    })
  }

  // 按 in-memory 过滤后的总数 + 分页
  const filteredTotal = filtered.length
  const pageItems = filtered
    .sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0
      return tb - ta
    })
    .slice((page - 1) * pageSize, (page - 1) * pageSize + Math.min(pageSize, 200))

  return {
    items: pageItems,
    total: filteredTotal,
    dbTotal: total, // 调试用, frontend 不用
    page,
    pageSize
  }
}

/**
 * 平台超管: 加载会话详情 (含所有消息, 不受软删过滤)
 */
async function platformGetDetail({ id }) {
  const conv = await AgentConversation.findOne({ _id: id })
    .populate({ path: 'user', select: 'mobile realName' })
    .populate({ path: 'org', select: 'unicode name nameAbbreviation' })
    .lean()
  if (!conv) throw ApiError.notFound('会话不存在')
  const messages = await AgentMessage.find({ conversation: id })
    .sort({ seq: 1 })
    .lean()
  return { ...conv, messages }
}

/**
 * 平台超管: 批量**物理**删除 (2026-06-18 用户决策两轮叠加)
 *  - 第 1 轮: 平台超管删 = 不可恢复的物理删, 不走软删
 *  - 第 2 轮: **只清理"已软删"** 的会话 (isDeleted=true)
 *    业务背景: 用户自己 DELETE 会走 softRemove (留 30 天反悔窗口)
 *             超管负责定期"清扫"这些已被用户标记的会话 (永久清理)
 *             没被软删的 (用户还在用的) 不允许超管直接物理删, 自动跳过
 *  - 同步物理删 messages (无外键约束, 用 conversation 字段手 deleteMany)
 *  - 幂等: 没命中 (找不到或未软删) 不报错, 返回 skipped 让前端提示
 *  - 物理删除不反悔, 前端需 DestructiveConfirm 双确认 (前端在 AiConversations.vue 处理)
 */
async function platformBatchRemove({ ids }) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw ApiError.badRequest('ids 必须是非空数组')
  }
  if (ids.length > 200) {
    throw ApiError.badRequest('单次最多 200 个')
  }
  // 1) 筛"已软删"的会话 id
  const eligible = await AgentConversation.find(
    { _id: { $in: ids }, isDeleted: true },
    { _id: 1 }
  ).lean()
  const eligibleIds = eligible.map((d) => d._id)
  const skipped = ids.length - eligibleIds.length

  if (eligibleIds.length === 0) {
    // 全是未软删 / 不存在: 不报错, 直接返回, 让前端弹"无可清理"提示
    return {
      requested: ids.length,
      deleted: 0,
      messagesDeleted: 0,
      skipped
    }
  }

  // 2) 先物理删 messages, 再物理删 conversations (顺序保证, 便于排查日志)
  const msgRes = await AgentMessage.deleteMany({ conversation: { $in: eligibleIds } })
  const convRes = await AgentConversation.deleteMany({ _id: { $in: eligibleIds } })
  return {
    requested: ids.length,
    deleted: convRes.deletedCount || 0,
    messagesDeleted: msgRes.deletedCount || 0,
    skipped
  }
}

/* ─── 追加消息 (核心写入) ──────────────────────── */

/**
 * 追加一条消息, 并维护会话的统计字段
 *
 * 入参:
 *  - conversationId: 已存在的会话 id
 *  - role: 'user' | 'assistant' | 'tool'
 *  - content: blocks 数组 (与前端一致)
 *  - toolCalls / toolCallId / businessRefs / hasError / errorMessage: 可选
 *
 * 返回: 写入的 message 文档
 */
async function addMessage({ conversationId, userId, orgId, role, content, toolCalls, toolCallId, businessRefs, hasError, errorMessage }) {
  const conv = await AgentConversation.findOne({
    _id: conversationId,
    user: userId,
    org: orgId,
    isDeleted: { $ne: true }
  })
  if (!conv) throw ApiError.notFound('会话不存在或无权限')

  // 顺序号: 原子递增 (findOneAndUpdate 拿 $inc 后的值)
  const next = await AgentConversation.findOneAndUpdate(
    { _id: conversationId },
    { $inc: { messageCount: 1 } },
    { new: true, select: { messageCount: 1 } }
  )
  const seq = next.messageCount

  const msg = await AgentMessage.create({
    org: orgId,
    user: userId,
    conversation: conversationId,
    seq,
    role,
    content: content || [],
    toolCalls: toolCalls || null,
    toolCallId: toolCallId || null,
    businessRefs: businessRefs || null,
    hasError: !!hasError,
    errorMessage: errorMessage || ''
  })

  // 维护会话元字段
  const convUpdate = {
    lastMessageAt: msg.createdAt
  }
  if (conv.firstMessageAt == null) convUpdate.firstMessageAt = msg.createdAt
  if (role === 'user') {
    convUpdate.lastUserMessageAt = msg.createdAt
    convUpdate.userMessageCount = (conv.userMessageCount || 0) + 1
  }
  if (role === 'assistant' && Array.isArray(toolCalls) && toolCalls.length > 0) {
    convUpdate.toolCallCount = (conv.toolCallCount || 0) + toolCalls.length
  }

  // (2026-06-18) 标题生成策略调整:
  //  - 第一条 user 消息 → 立即 (不再依赖 title==='新会话' 这种 race 条件)
  //    之前是只在 conv.title === '新会话' 时才覆盖, lazy create + 并发写入时会失效
  //  - 已自定义的 title 不覆盖 (除非显式传 isAutoTitle=true)
  //  - 只在 userMessageCount 从 0→1 时 (即首条 user 消息) 设置
  if (role === 'user' && (conv.userMessageCount || 0) === 0) {
    const firstText = (content || []).find((b) => b.type === 'text')
    if (firstText && firstText.content) {
      convUpdate.title = truncate(
        firstText.content.replace(/\s+/g, ' ').trim(),
        MAX_TITLE_LEN
      )
      convUpdate.titleAuto = true // 标记: 系统自动生成, 前端可显示 "(自动)"
    }
  }

  // 兜底: 摘要节流更新 (基于首条 user 消息)
  if (role === 'user') {
    const now = msg.createdAt.getTime()
    const lastUpdate = conv.summaryUpdatedAt ? conv.summaryUpdatedAt.getTime() : 0
    if (now - lastUpdate > SUMMARY_MIN_INTERVAL_MS) {
      const firstText = (content || []).find((b) => b.type === 'text')
      if (firstText && firstText.content) {
        convUpdate.summary = truncate(
          firstText.content.replace(/\s+/g, ' ').trim(),
          MAX_SUMMARY_LEN
        )
        convUpdate.summaryUpdatedAt = msg.createdAt
      }
    }
  }

  await AgentConversation.updateOne({ _id: conversationId }, { $set: convUpdate })

  return msg.toObject()
}

/**
 * 便利: 追加 user 消息 (前端发送时调)
 */
async function addUserMessage({ conversationId, userId, orgId, blocks }) {
  return addMessage({ conversationId, userId, orgId, role: 'user', content: blocks })
}

/**
 * 便利: 追加 assistant 消息 (流结束 / executeTool 完成时调)
 */
async function addAssistantMessage({ conversationId, userId, orgId, blocks, toolCalls, hasError, errorMessage, model, latencyMs, usage }) {
  // 同步把 LLM 元信息写回 conversation (末次)
  if (model || latencyMs || usage) {
    const u = {}
    if (model) u.model = model
    if (latencyMs) u.lastLatencyMs = latencyMs
    if (usage) u.lastUsage = usage
    await AgentConversation.updateOne(
      { _id: conversationId, user: userId, org: orgId },
      { $set: u }
    ).catch(() => {})
  }
  return addMessage({ conversationId, userId, orgId, role: 'assistant', content: blocks, toolCalls, hasError, errorMessage })
}

/**
 * 便利: 追加 tool 消息 (executeTool 单独执行后调)
 */
async function addToolResultMessage({ conversationId, userId, orgId, toolCallId, content, hasError, errorMessage }) {
  return addMessage({ conversationId, userId, orgId, role: 'tool', content, toolCallId, hasError, errorMessage })
}

/* ─── 内部工具 ─────────────────────────────────── */

function truncate(s, n) {
  if (!s) return ''
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

module.exports = {
  // 用户级
  list,
  countActiveForUser,
  createEmpty,
  getOrCreate,
  getDetail,
  patch,
  softRemove,
  addMessage,
  addUserMessage,
  addAssistantMessage,
  addToolResultMessage,
  // 平台超管
  platformList,
  platformGetDetail,
  platformBatchRemove,
  // 常量
  MAX_CONVERSATIONS_PER_USER
}
