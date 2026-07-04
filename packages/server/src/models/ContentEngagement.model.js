'use strict'

const { Schema, model } = require('mongoose')

/**
 * 科普内容用户参与度事件流 (ContentEngagement)
 *
 * 设计 (2026-07-04 立项):
 *   - append-only 事件流, 每一行 = 一次「孩子读了/看了/玩了」某个内容
 *   - 与现有 Article.viewCount / Video.viewCount 计数器并存:
 *     - 计数器 (doc.on) = 「页面浏览/启动」次数, 始终 +1 / cheap counter
 *     - 事件流 (本表)   = 「哪个孩子看了多少时间」, 用于 KPI 唯一观众数 + 时长聚合
 *   - mirror PetEvent 模式: 写失败不阻塞业务 (engagement.service#record 已 swallow)
 *
 * 字段:
 *   org           — 机构 (per-org 隔离必带, 多租户)
 *   contentType   — article / video
 *   contentId     — 该内容 doc id
 *   activeStudent — 实际使用内容的孩子 (按 activeStudentId 拍板 2026-07-04)
 *   source        — client / admin / system (预留, 默认 client)
 *   sessionMs     — 视频/游戏累计停留 ms; 文章/未上报 = 0 (聚合时跳过)
 *   occurredAt    — 事件时间 (自带索引, 默认 now)
 */
const ContentEngagementSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    contentType: {
      type: String,
      enum: ['article', 'video'],
      required: true,
      index: true
    },
    contentId: { type: Schema.Types.ObjectId, required: true, index: true },
    activeStudent: {
      type: Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true
    },
    source: {
      type: String,
      enum: ['client', 'admin', 'system'],
      default: 'client'
    },
    sessionMs: { type: Number, default: 0, min: 0 },
    occurredAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true, collection: 'content_engagements' }
)

// per-content 时序 (admin 端按内容查时段)
ContentEngagementSchema.index({ org: 1, contentType: 1, contentId: 1, occurredAt: -1 })

// 「独立孩子观众」去重索引 (admin list rowStats)
ContentEngagementSchema.index({ org: 1, contentType: 1, activeStudent: 1, contentId: 1 })

module.exports = model('ContentEngagement', ContentEngagementSchema)
