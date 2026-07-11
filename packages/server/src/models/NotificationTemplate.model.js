'use strict'

const { Schema, model } = require('mongoose')

/**
 * 通知模板（NotificationTemplate）—— v0.9 立项
 *
 * 设计要点：
 * 1. **org=null = 平台默认模板**，非 null = 机构自定义（机构可覆盖平台默认）
 * 2. **per (type, channel)**：同一 type 在不同渠道（inbox / wechatMini / sms）下可有不同模板
 * 3. **占位符渲染**：title / body 含 {studentName} {courseName} {time} {room} 等占位符；
 *    publish 时按白名单字段替换；严禁渲染身份证/卡号等敏感字段
 * 4. **多渠道字段**：wechatTemplateId（P2 微信订阅消息）/ smsTemplateCode（P3 短信平台）
 *    MVP 不使用，schema 留位
 *
 * 字段说明：
 * - type 与 Notification.type 对应（如 lesson_remind_1h / task_due）
 * - channel 与 Notification.channels[].channel 对应（inbox / wechatMini / sms）
 */
const NotificationTemplateSchema = new Schema(
  {
    // 归属机构（null = 平台默认模板；机构自定义时非 null）
    org: { type: Schema.Types.ObjectId, ref: 'Org', default: null, index: true },

    // 模板标识
    type: { type: String, required: true },
    channel: { type: String, enum: ['inbox', 'wechatMini', 'wechatPublic', 'sms', 'push'], required: true },

    // 渲染文案（含占位符）
    title: { type: String, required: true },
    body: { type: String, required: true },

    // 渠道特定字段（P2 / P3 启用）
    wechatTemplateId: { type: String, default: null },
    smsTemplateCode: { type: String, default: null },

    // 是否启用
    isActive: { type: Boolean, default: true },

    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'notification_templates' }
)

// 唯一索引：per (org, type, channel)；org=null 时用 sparse 让平台默认模板唯一
NotificationTemplateSchema.index(
  { org: 1, type: 1, channel: 1 },
  {
    unique: true,
    partialFilterExpression: { org: { $type: 'objectId' } }
  }
)
// 平台默认模板唯一：org=null 的 (type, channel) 唯一
NotificationTemplateSchema.index(
  { type: 1, channel: 1 },
  {
    unique: true,
    partialFilterExpression: { org: null }
  }
)
// 列表查询
NotificationTemplateSchema.index({ type: 1, channel: 1, isActive: 1 })

module.exports = model('NotificationTemplate', NotificationTemplateSchema)