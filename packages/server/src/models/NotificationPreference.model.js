'use strict'

const { Schema, model } = require('mongoose')

/**
 * 通知偏好（NotificationPreference）—— v0.9 立项
 *
 * 设计要点：
 * 1. **per user per org**：同一家长在 A 机构开 lesson 提醒，在 B 机构关掉，偏好独立；
 *    一个家长在两个机构 → 两条 NotificationPreference 文档
 * 2. **三层开关**：
 *    - globalEnabled：总开关；false 时所有外发停掉（inbox 仍可看）
 *    - categories.<cat>.enabled：per 大类开关（如"作业到期"）—— system 类固定为 true（仅 globalEnabled 控）
 *    - channels.<ch>.enabled：per 渠道开关（如"微信"）—— inbox 固定 true
 * 3. **能力自动计算**：channels.<ch>.capability 由系统根据 User.wechatUnionId / User.mobile 派生
 *    - 用户不可改 capability；publish 时计算 intersection 决定是否真发
 * 4. **懒创建**：首次 publish 时若用户无偏好文档，按 DEFAULT_PREFERENCES 创建
 * 5. **安静时段**：P2 上线，默认 22:00-08:00
 *
 * 字段说明：
 * - channels.inbox.capability 永远 true（站内必到）
 * - channels.sms 默认 enabled=false（怕扣费；用户在偏好页勾选后才开）
 */
const NotificationPreferenceSchema = new Schema(
  {
    // 偏好归属：用户 + 机构
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true },

    // 总开关（关掉后所有外发停掉，inbox 仍可见历史）
    globalEnabled: { type: Boolean, default: true },

    // per 分类开关
    categories: {
      lesson:     { enabled: { type: Boolean, default: true },  channels: { type: [String], default: ['inbox'] } },
      task:       { enabled: { type: Boolean, default: true },  channels: { type: [String], default: ['inbox'] } },
      order:      { enabled: { type: Boolean, default: true },  channels: { type: [String], default: ['inbox'] } },
      evaluation: { enabled: { type: Boolean, default: true },  channels: { type: [String], default: ['inbox'] } },
      point:      { enabled: { type: Boolean, default: false }, channels: { type: [String], default: [] } },       // 默认关
      pet:        { enabled: { type: Boolean, default: false }, channels: { type: [String], default: [] } },       // 默认关
      access:     { enabled: { type: Boolean, default: true },  channels: { type: [String], default: ['inbox'] } },
      system:     { enabled: { type: Boolean, default: true },  channels: { type: [String], default: ['inbox'] } }  // system 仅 globalEnabled 控
    },

    // per 渠道（enabled 用户可改，capability 由系统派生）
    channels: {
      inbox:        { enabled: { type: Boolean, default: true },  capability: { type: Boolean, default: true } },   // 永远
      wechatMini:   { enabled: { type: Boolean, default: true },  capability: { type: Boolean, default: false } },  // 绑微信→true
      wechatPublic: { enabled: { type: Boolean, default: false }, capability: { type: Boolean, default: false } },
      sms:          { enabled: { type: Boolean, default: false }, capability: { type: Boolean, default: false } },  // 默认 enabled 关
      push:         { enabled: { type: Boolean, default: false }, capability: { type: Boolean, default: false } }
    },

    // 安静时段（P2 上线，默认关）
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' },
      end: { type: String, default: '08:00' }
    },

    // 扩展字段
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'notification_preferences' }
)

// per user per org unique
NotificationPreferenceSchema.index({ user: 1, org: 1 }, { unique: true })

module.exports = model('NotificationPreference', NotificationPreferenceSchema)