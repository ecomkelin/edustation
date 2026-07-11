'use strict'

const { Schema, model } = require('mongoose')

/**
 * 通知消息（Notification）—— v0.9 立项
 *
 * 设计要点：
 * 1. **三层架构**：
 *    - Layer 1（本模型）— 消息落库 / 红点 / 审计；永远可达，inbox 必到
 *    - Layer 2（service.publish）— 拉偏好 → 计算可用渠道 → 调度
 *    - Layer 3（adapters/*）— wechatMini / sms / push / ws 渠道适配
 * 2. **Inbox 必到**：channels[] 数组里 inbox 永远存在；即使外发全部失败，用户也能在 C 端「消息 → 系统消息」翻到
 * 3. **渠道独立追踪**：每行 channel 独立记录 status/reason/externalId/sentAt/error
 *    - status: pending → sent | failed | skipped
 *    - reason: opted_out / no_capability / rate_limited / invalid_target
 * 4. **状态机**：unread → read / archived；归档走软归档范式（CLAUDE.md §8.2），默认 list 隐藏
 * 5. **隐私红线**：body 严禁身份证/卡号；模板渲染走白名单字段
 * 6. **scheduledFor**：null = 即时发送；非空 = cron 到点发送（lesson_remind_1h 等）
 *
 * 字段说明：
 * - recipientRole：区分家长 / 员工 / 平台超管；C 端只发 parent，员工 / 平台有自己的通知收件箱
 * - activeStudent：业务上"这条通知关联哪个孩子"，C 端切孩子时 inbox 按 kid 过滤
 * - payload.deeplink：C 端点击消息跳转路径
 * - channels[].channel：inbox / wechatMini / wechatPublic / sms / push / websocket
 */
const NotificationSchema = new Schema(
  {
    // 所属机构（多租户隔离；跨机构场景下 NotificationLog / Template 也按 org 隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 接收人
    recipient: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recipientRole: { type: String, enum: ['parent', 'staff', 'platform'], default: 'parent' },
    // 业务关联的学员（C 端家长切换孩子上下文时用于过滤）
    activeStudent: { type: Schema.Types.ObjectId, ref: 'Student', default: null },

    // 类型与分类（type=具体场景；category=大类用于偏好开关）
    // type 示例: lesson_remind_1h / lesson_remind_24h / lesson_absent / task_due / task_assigned /
    //           order_paid / order_refunded / evaluation_published / point_grant /
    //           pet_critical / access_stranger / system_notice
    // category 示例: lesson / task / order / evaluation / point / pet / access / system
    type: { type: String, required: true },
    category: { type: String, required: true },

    // 渲染后内容（模板占位符已替换；C 端 / 短信 / 推送统一使用）
    title: { type: String, required: true },
    body: { type: String, required: true },

    // 业务实体引用 + 跳转链接
    payload: {
      entityType: { type: String, default: null },
      entityId: { type: Schema.Types.ObjectId, default: null },
      deeplink: { type: String, default: null }
    },

    // 通知本身的状态机（仅 inbox 视角）
    status: { type: String, enum: ['unread', 'read', 'archived'], default: 'unread' },
    readAt: { type: Date, default: null },
    archivedAt: { type: Date, default: null },

    // 渠道分发明细（inbox 永远在第一行）
    channels: [{
      channel: { type: String, enum: ['inbox', 'wechatMini', 'wechatPublic', 'sms', 'push', 'websocket'], required: true },
      status: { type: String, enum: ['pending', 'sent', 'failed', 'skipped'], default: 'pending' },
      reason: { type: String, default: null },         // opted_out / no_capability / rate_limited / invalid_target
      externalId: { type: String, default: null },    // 微信模板消息 msgId / 短信回执 ID
      sentAt: { type: Date, default: null },
      error: { type: String, default: null }
    }],

    // 调度：null = 即时；非空 = 等待 cron 到点发送（lesson_remind_1h 提前 1h）
    scheduledFor: { type: Date, default: null, index: true },
    // 触发源
    source: { type: String, enum: ['event', 'cron', 'manual'], default: 'event' },

    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'notifications' }
)

// inbox 主查询：某用户的全部未归档消息按时间倒序
NotificationSchema.index({ recipient: 1, archivedAt: 1, createdAt: -1 })
// 红点未读数
NotificationSchema.index({ recipient: 1, status: 1 })
// 按 activeStudent 过滤（C 端切孩子用）
NotificationSchema.index({ recipient: 1, activeStudent: 1, status: 1 })
// cron 待发扫描：scheduledFor 早于 now 且 channels 还有 pending 的
NotificationSchema.index({ scheduledFor: 1, 'channels.status': 1 })
// 机构管理后台统计
NotificationSchema.index({ org: 1, type: 1, createdAt: -1 })

module.exports = model('Notification', NotificationSchema)