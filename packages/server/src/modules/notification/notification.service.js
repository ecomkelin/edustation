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
  lesson_absent: 'lesson',
  task_due: 'task',
  task_assigned: 'task',
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

  // 拉取 recipient + 偏好
  const [recipient, prefs] = await Promise.all([
    User.findById(recipientId).select('_id isActive isBlocked wechatUnionId mobile').lean(),
    prefService.getOrCreate(orgId, recipientId)
  ])
  if (!recipient) throw ApiError.notFound('接收人不存在')
  if (recipient.isBlocked) {
    return { skipped: true, reason: 'recipient_blocked' }
  }

  // 拉模板（inbox）
  const tpl = await tplService.getTemplate(orgId, type, 'inbox')
  let title = ''
  let body = ''
  if (tpl) {
    const rendered = tplService.render(tpl, input.vars || {})
    title = rendered.title
    body = rendered.body
  } else {
    // 兜底：模板缺失时 publish 仍可落库（管理员可后期补模板）
    title = type
    body = type
  }

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
    recipientRole: 'parent', // MVP 暂仅家长；员工 inbox 待 Phase 4 扩展
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
      dispatchAll(doc._id.toString(), orgId, recipient, channels, tpl, input.vars || {})
        .catch((e) => console.error('[notification.publish] dispatch error:', e))
    })
  }

  return { notification: doc.toObject() }
}

/**
 * 内部：dispatch 所有渠道（异步执行）
 */
async function dispatchAll(notificationId, orgId, recipient, channels, template, vars) {
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
    dispatchAll(d._id.toString(), d.org, recipient, channels, tpl, {}).catch((e) =>
      console.error('[notification.dispatchScheduled] error:', e.message)
    )
  }
  return { dispatched: docs.length }
}

module.exports = {
  publish,
  listMe,
  unreadCount,
  markRead,
  markAllRead,
  archive,
  archiveAll,
  listLogs,
  dispatchScheduled,
  DEFAULT_CATEGORY_FOR_TYPE,
  categoryOf
}