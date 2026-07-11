'use strict'

const { Schema, model } = require('mongoose')

/**
 * 通知发送流水（NotificationLog）—— v0.9 立项
 *
 * 设计要点：
 * 1. **审计专用**：每条 Notification 每次渠道发送都写一行流水，便于失败排查 / 重试 / 合规审计
 * 2. **30 天 TTL**：仅保留审计期，避免无限增长；老数据由 NotificationLog 自身 TTL 索引清理
 * 3. **request / response 完整记录**：微信回包 / 短信回执原文入库，便于客服反馈"为什么没收到"
 *
 * 字段说明：
 * - notification: 关联 Notification._id；与 channels[] 一一对应（每渠道一行）
 * - request: 渠道 SDK 调用的入参（含收件人 / 模板 ID / 渲染后内容）
 * - response: 渠道 SDK 返回的原始报文
 * - retryCount: 重试次数；管理员在「发送流水」页可一键重试失败的
 */
const NotificationLogSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    notification: { type: Schema.Types.ObjectId, ref: 'Notification', required: true },
    channel: { type: String, enum: ['inbox', 'wechatMini', 'wechatPublic', 'sms', 'push', 'websocket'], required: true },
    status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], required: true },
    // 入参 / 回包原文（JSON.stringified）
    request: { type: Schema.Types.Mixed, default: null },
    response: { type: Schema.Types.Mixed, default: null },
    error: { type: String, default: null },
    retryCount: { type: Number, default: 0 },
    sentAt: { type: Date, default: Date.now }
  },
  {
    timestamps: false,        // 不需要 createdAt / updatedAt；用 sentAt 即可
    collection: 'notification_logs',
    // 30 天 TTL 索引：sentAt + 30 天后自动清理
    expireAfterSeconds: 30 * 24 * 60 * 60
  }
)

// 按通知 ID 反查
NotificationLogSchema.index({ notification: 1, channel: 1 })
// 管理后台「发送流水」分页
NotificationLogSchema.index({ org: 1, sentAt: -1 })

module.exports = model('NotificationLog', NotificationLogSchema)