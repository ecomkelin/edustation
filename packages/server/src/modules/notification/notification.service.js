'use strict'

/**
 * 通知服务（v0.9 立项）—— 核心 publish / list / read / archive
 *
 * 三层架构核心入口：
 *   publish() → 拉偏好 → 计算可用渠道 → 调 ChannelAdapter.send()
 *
 * 公开 API：
 *   - publish(input)              — 业务触发调用（lessonAttendance / task / order 等）
 *   - listMe(userId, opts)        — C 端 inbox 列表
 *   - unreadCount(userId, opts)   — C 端红点
 *   - markRead(userId, id)        — 单条已读
 *   - markAllRead(userId, opts)   — 一键已读
 *   - archive(userId, id)         — 单条归档
 *   - archiveAll(userId, opts)    — 一键归档
 *   - listLogs(orgId, opts)       — 管理后台流水（仅 notification.read）
 *
 * 设计要点：
 *   - inbox 永远必到：channels[] 数组里 inbox 始终存在，即便所有外发渠道都 skip
 *   - channels[] 记录每渠道 status / reason / externalId / sentAt / error，便于排查
 *   - publish 同步返回 Notification 文档；外发异步执行（队列感不强但开 fire-and-forget）
 *   - 软归档（CLAUDE.md §8.2）：默认 list 隐藏 archivedAt 非空
 */

const Notification = require('@models/Notification.model')
const NotificationLog = require('@models/NotificationLog.model')
const User = require('@models/User.model')
const ApiError = require('@utils/ApiError')
const prefService = require('./notificationPreference.service')
const tplService = require('./notificationTemplate.service')
const adapters = require('./adapters')

const DEFAULT_CATEGORY_FOR_TYPE = {
  // 2026-07-12: lesson_remind_1h 已下线 (cron + service.publishLessonReminder1h 全链路移除),
  // 改为事件驱动的 lesson_prepare_reminder; 老 type 保留只是兜底, 不再主动 publish
  lesson_remind_24h: 'lesson',
  lesson_prepare_reminder: 'lesson',
  lesson_preparing: 'lesson',           // 2026-07-13: 排课进入 preparing, 通知任课老师
  lesson_absent: 'lesson',
  task_due: 'task',
  task_assigned: 'task',                // 2026-07-13: 任务分配
  task_rejected: 'task',                // 2026-07-13: 任务被打回
  task_approved: 'task',                // 2026-07-13: 任务审批通过
  task_cancelled: 'task',               // 2026-07-13: 任务被取消
  task_comment: 'task',
  order_paid: 'order',
  order_refunded: 'order',
  evaluation_published: 'evaluation',
  point_grant: 'point',
  point_deduct: 'point',
  pet_critical: 'pet',
  access_stranger: 'access',
  system_notice: 'system'
}

/**
 * 校验 type → 派生 category
 */
function categoryOf(type) {
  return DEFAULT_CATEGORY_FOR_TYPE[type] || 'system'
}

// ─────────────────────────────────────────────────────────────
// 内部工具：调渠道适配器 + 写流水
// ─────────────────────────────────────────────────────────────

async function dispatchChannel(notification, channel, recipient, template, vars) {
  const adapter = adapters[channel]
  if (!adapter) {
    return { channel, status: 'skipped', reason: 'no_adapter' }
  }
  // 能力检测
  if (typeof adapter.isAvailable === 'function' && !adapter.isAvailable(recipient)) {
    return { channel, status: 'skipped', reason: 'no_capability' }
  }
  try {
    const result = await adapter.send(notification, recipient, template, vars)
    return {
      channel,
      status: result && result.error ? 'failed' : 'sent',
      externalId: result && result.externalId ? String(result.externalId) : null,
      error: result && result.error ? String(result.error) : null,
      sentAt: new Date()
    }
  } catch (e) {
    return {
      channel,
      status: 'failed',
      error: (e && e.message) ? String(e.message) : String(e),
      sentAt: new Date()
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 核心 publish
// ─────────────────────────────────────────────────────────────

/**
 * @param {Object} input
 * @param {String} input.orgId
 * @param {String} input.recipientId
 * @param {String} input.type           — lesson_remind_1h / task_due / ...
 * @param {String} [input.category]     — 默认按 type 派生
 * @param {String} [input.recipientRole] — 'parent' | 'staff' | 'platform', 默认 'parent'
 *   2026-07-13: 新增 staff 入参 — 任务/排课触发点接收人是员工, 不能再硬编码 'parent'.
 *     否则按 recipientRole 过滤 / Admin Logs 展示 / 未来员工 inbox 都会错位
 * @param {Object} input.vars           — 模板占位符变量
 * @param {Object} [input.payload]      — { entityType, entityId, deeplink }
 * @param {String} [input.activeStudentId]
 * @param {Date}   [input.scheduledFor] — null=立即；非空=定时发送
 * @param {String} [input.source]       — event / cron / manual
 */
async function publish(input) {
  if (!input || !input.orgId || !input.recipientId || !input.type) {
    throw ApiError.badRequest('publish: 缺少 orgId / recipientId / type')
  }
  const orgId = input.orgId
  const recipientId = input.recipientId
  const type = input.type
  const category = input.category || categoryOf(type)
  const recipientRole = input.recipientRole || 'parent'

  // 拉取 recipient + 偏好
  const [recipient, prefs] = await Promise.all([
    User.findById(recipientId).select('_id isActive isBlocked wechatUnionId mobile').lean(),
    prefService.getOrCreate(orgId, recipientId)
  ])
  if (!recipient) throw ApiError.notFound('接收人不存在')
  if (recipient.isBlocked) {
    return { skipped: true, reason: 'recipient_blocked' }
  }

  // 拉模板（inbox） — v5 2026-08-02 行为变更:
  //   1. 本机构有 org 副本 → 用 org 副本 (不论 isActive)
  //   2. org 副本 isActive=false (用户在管理后台显式关闭) → skipped, 尊重用户禁用
  //   3. 本机构没 org 副本 → 降级到平台默认 (org=null) 渲染并发出去,
  //      仅控制台 warn (不替本机构自动落 org 副本 — 那个会越权改用户"未启用"语义)
  //   4. 平台默认也没 → skipped (上游 bug)
  // 历史: v4 (2026-07-18) 把 getTemplate 改成 org-only, 结果"新机构 / 没启用副本"所有通知
  //   全部静默丢, 不写 inbox 不报错. 用户实际使用 (例如发任务) 不可能期望必须先在后台
  //   启用模板副本才发 — 退回 v3 的 platform fallback 行为, 但保留"org 副本 isActive=false
  //   即停用"的语义 (用户在 Templates UI 明确关掉的, 我们不动).
  const orgTpl = await tplService.getTemplate(orgId, type, 'inbox')
  let tpl = orgTpl
  if (!tpl) {
    tpl = await tplService.getTemplate(null, type, 'inbox')
    if (tpl) {
      // eslint-disable-next-line no-console
      console.warn(`[notification.publish] org=${orgId} 无 ${type} 副本, 降级用平台默认 (org=null)`)
    }
  }
  if (!tpl) {
    return { skipped: true, reason: 'template_not_found' }
  }
  if (tpl.isActive === false) {
    return { skipped: true, reason: 'template_disabled' }
  }
  // 渲染
  const rendered = tplService.render(tpl, input.vars || {})
  let title = rendered.title
  let body = rendered.body

  // 计算可用渠道
  // - inbox 永远在；其余渠道：globalEnabled + category.enabled + channel.enabled + channel.capability
  const channels = ['inbox']
  for (const ch of ['wechatMini', 'wechatPublic', 'sms', 'push', 'websocket']) {
    if (prefService.isChannelEnabled(prefs, category, ch)) {
      channels.push(ch)
    }
  }

  // channels[] 初始行：inbox status=pending，其余 status=skipped + reason
  const channelRows = channels.map((ch) => ({
    channel: ch,
    status: 'pending',
    reason: null,
    externalId: null,
    sentAt: null,
    error: null
  }))

  // 创建 Notification 文档
  const doc = await Notification.create({
    org: orgId,
    recipient: recipientId,
    recipientRole,
    activeStudent: input.activeStudentId || null,
    type,
    category,
    title,
    body,
    payload: {
      entityType: (input.payload && input.payload.entityType) || null,
      entityId:   (input.payload && input.payload.entityId)   || null,
      deeplink:   (input.payload && input.payload.deeplink)   || null
    },
    status: 'unread',
    channels: channelRows,
    scheduledFor: input.scheduledFor || null,
    source: input.source || 'event'
  })

  // 即时发送：fire-and-forget 异步 dispatch（不等外发回包，publish 立即返）
  if (!input.scheduledFor || input.scheduledFor.getTime() <= Date.now()) {
    setImmediate(() => {
      dispatchAll(doc._id.toString(), orgId, recipient, channels, tpl, input.vars || {}, orgTpl)
        .catch((e) => console.error('[notification.publish] dispatch error:', e))
    })
  }

  return { notification: doc.toObject() }
}

/**
 * 内部：dispatch 所有渠道（异步执行）
 * @param {Object|null} orgTplFallback — 用来标记 "是否降级到 platform" 写进日志.
 *   如果用 org 副本, 传 orgTpl 本体; 如果是 platform fallback, 传 null 区别.
 */
async function dispatchAll(notificationId, orgId, recipient, channels, template, vars, orgTplFallback) {
  const results = await Promise.all(
    channels.map((ch) => dispatchChannel({ _id: notificationId }, ch, recipient, template, vars))
  )
  // 写回 channels[]
  await Notification.updateOne(
    { _id: notificationId },
    {
      $set: {
        channels: results.map((r) => ({
          channel: r.channel,
          status: r.status,
          reason: r.reason || null,
          externalId: r.externalId || null,
          sentAt: r.sentAt || null,
          error: r.error || null
        }))
      }
    }
  )
  // 写流水（仅非 inbox 也写 inbox 流水便于审计）
  const logDocs = results.map((r) => ({
    org: orgId,
    notification: notificationId,
    channel: r.channel,
    status: r.status,
    request: { vars, templateTitle: template ? template.title : null },
    response: r.externalId ? { externalId: r.externalId } : null,
    error: r.error || null,
    sentAt: r.sentAt || new Date()
  }))
  if (logDocs.length) {
    await NotificationLog.insertMany(logDocs, { ordered: false }).catch((e) => {
      console.error('[notification.dispatchAll] log insert error:', e.message)
    })
  }
}

// ─────────────────────────────────────────────────────────────
// C 端 inbox API
// ─────────────────────────────────────────────────────────────

/**
 * inbox 列表（默认隐藏 archived）
 * @param {Object} opts { page, pageSize, status, activeStudentId, archived }
 */
async function listMe(userId, opts = {}) {
  const filter = { recipient: userId }
  if (opts.activeStudentId) filter.activeStudent = opts.activeStudentId
  // 默认隐藏 archived；传 ?archived=true 才看历史
  if (opts.archived === 'true' || opts.archived === true) {
    filter.archivedAt = { $ne: null }
  } else {
    filter.archivedAt = null
  }
  if (opts.status) filter.status = opts.status

  const page = Math.max(1, parseInt(opts.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(opts.pageSize, 10) || 20))
  const skip = (page - 1) * pageSize

  const [items, total] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(pageSize).lean(),
    Notification.countDocuments(filter)
  ])
  return { items, total, page, pageSize }
}

/**
 * 红点未读数（聚合管道，只返 count 不拉详情）
 */
async function unreadCount(userId, opts = {}) {
  const filter = {
    recipient: userId,
    status: 'unread',
    archivedAt: null
  }
  if (opts.activeStudentId) filter.activeStudent = opts.activeStudentId
  const count = await Notification.countDocuments(filter)
  return { count }
}

/**
 * 单条详情（资源属主校验，不动 status — 让前端决定何时 markRead）
 * 2026-07-18: C 端 / admin 详情页用 — 替代 listMe + find 一条的笨拙姿势
 * @param {String} userId
 * @param {String} id
 * @returns {Promise<Object>}
 */
async function getOne(userId, id) {
  const doc = await Notification.findOne({ _id: id, recipient: userId }).lean()
  if (!doc) throw ApiError.notFound('消息不存在')
  return doc
}

/**
 * 单条已读（资源属主校验）
 */
async function markRead(userId, id) {
  const doc = await Notification.findOne({ _id: id, recipient: userId })
  if (!doc) throw ApiError.notFound('消息不存在')
  if (doc.status === 'unread') {
    doc.status = 'read'
    doc.readAt = new Date()
    await doc.save()
  }
  return doc.toObject()
}

/**
 * 一键已读
 */
async function markAllRead(userId, opts = {}) {
  const filter = {
    recipient: userId,
    status: 'unread',
    archivedAt: null
  }
  if (opts.activeStudentId) filter.activeStudent = opts.activeStudentId
  const r = await Notification.updateMany(
    filter,
    { $set: { status: 'read', readAt: new Date() } }
  )
  return { modified: r.modifiedCount || 0 }
}

/**
 * 单条归档
 */
async function archive(userId, id) {
  const doc = await Notification.findOne({ _id: id, recipient: userId })
  if (!doc) throw ApiError.notFound('消息不存在')
  if (!doc.archivedAt) {
    doc.archivedAt = new Date()
    if (doc.status === 'unread') {
      doc.status = 'read'
      doc.readAt = new Date()
    }
    await doc.save()
  }
  return doc.toObject()
}

/**
 * 一键归档
 */
async function archiveAll(userId, opts = {}) {
  const filter = {
    recipient: userId,
    archivedAt: null
  }
  if (opts.activeStudentId) filter.activeStudent = opts.activeStudentId
  const r = await Notification.updateMany(
    filter,
    { $set: { archivedAt: new Date(), status: 'read', readAt: new Date() } }
  )
  return { modified: r.modifiedCount || 0 }
}

/**
 * 管理后台：发送流水
 */
async function listLogs(orgId, opts = {}) {
  const filter = { org: orgId }
  if (opts.channel) filter.channel = opts.channel
  if (opts.status) filter.status = opts.status
  const page = Math.max(1, parseInt(opts.page, 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(opts.pageSize, 10) || 20))
  const skip = (page - 1) * pageSize
  const [items, total] = await Promise.all([
    NotificationLog.find(filter).sort({ sentAt: -1 }).skip(skip).limit(pageSize).lean(),
    NotificationLog.countDocuments(filter)
  ])
  return { items, total, page, pageSize }
}

// cron 用：扫 scheduledFor ≤ now 且 channels 仍有 pending 的，调 dispatchAll
async function dispatchScheduled() {
  const now = new Date()
  const docs = await Notification.find({
    scheduledFor: { $lte: now, $ne: null },
    'channels.status': 'pending'
  })
    .limit(100)
    .lean()
  for (const d of docs) {
    const recipient = await User.findById(d.recipient).select('_id wechatUnionId mobile').lean()
    if (!recipient) continue
    const tpl = await tplService.getTemplate(d.org, d.type, 'inbox')
    const channels = (d.channels || []).filter((c) => c.status === 'pending').map((c) => c.channel)
    if (!channels.length) continue
    dispatchAll(d._id.toString(), d.org, recipient, channels, tpl, {}, tpl).catch((e) =>
      console.error('[notification.dispatchScheduled] error:', e.message)
    )
  }
  return { dispatched: docs.length }
}

module.exports = {
  publish,
  listMe,
  unreadCount,
  getOne,
  markRead,
  markAllRead,
  archive,
  archiveAll,
  listLogs,
  dispatchScheduled,
  DEFAULT_CATEGORY_FOR_TYPE,
  categoryOf
}