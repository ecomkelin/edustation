'use strict'

/**
 * AI 助手 - 会话
 *
 * 集合: agent_conversations
 *
 * 业务定位:
 *  - 一个"主题"级别的容器, 聚合一组 messages
 *  - 属于某个 user + org, 其他人不可见
 *  - title 自动从首条 user 消息生成, 可改
 *  - summary 是本会话"主要内容", 用于会话列表的副标题/预览
 *  - 消息不存本表, 通过 messageCount + lastMessageAt 维护元信息
 *  - 消息实际内容在 agent_messages (按 conversation 关联, 1:N)
 *
 * 索引:
 *  - { user, org, lastMessageAt: -1 } 主列表 (按用户+机构, 最新活跃优先)
 *  - { user, org, _id } 详情
 *  - { org, isPinned: -1, lastMessageAt: -1 } 置顶优先 (后续阶段)
 */

const mongoose = require('mongoose')

const AgentConversationSchema = new mongoose.Schema(
  {
    org: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // 展示字段
    title: { type: String, default: '新会话' },
    summary: { type: String, default: '' },           // 本会话主要内容, 列表副标题
    summaryUpdatedAt: { type: Date, default: null },  // 摘要生成时间

    // 统计字段
    messageCount: { type: Number, default: 0 },       // 总消息数 (user + assistant)
    userMessageCount: { type: Number, default: 0 },   // user 消息数 (用于"几条对话"展示)
    toolCallCount: { type: Number, default: 0 },      // 工具调用次数 (审计)

    // 时间字段
    firstMessageAt: { type: Date, default: null },    // 首条消息时间
    lastMessageAt: { type: Date, default: null, index: true }, // 最新活跃时间
    lastUserMessageAt: { type: Date, default: null }, // 最新 user 消息时间 (用于摘要生成节流)

    // 状态
    isArchived: { type: Boolean, default: false, index: true },
    isPinned: { type: Boolean, default: false },      // 后续阶段用

    // 软删 (2026-06-18): 用户/超管删除均软删, 真删走物理删除 (目前不开放)
    // - deletedBy: 'user' (本人软删) | 'platform' (超管软删)
    // - deletedAt: 软删时间 (用于审计)
    // - 非超管默认看不到 deletedAt != null 的会话
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null, index: true },
    deletedBy: { type: String, enum: ['user', 'platform', null], default: null },

    // LLM 摘要生成时的元数据 (用于质量回溯)
    model: { type: String, default: '' },
    lastLatencyMs: { type: Number, default: null },
    lastUsage: { type: mongoose.Schema.Types.Mixed, default: null },

    meta: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'agent_conversations' }
)

// 复合索引
AgentConversationSchema.index({ user: 1, org: 1, lastMessageAt: -1 })
AgentConversationSchema.index({ user: 1, org: 1, isArchived: 1, lastMessageAt: -1 })
AgentConversationSchema.index({ user: 1, org: 1, _id: 1 })

// 静态: 列出当前用户的会话 (默认按 lastMessageAt 倒序)
AgentConversationSchema.statics.listForUser = function ({ userId, orgId, limit = 50, includeArchived = false }) {
  const filter = { user: userId, org: orgId }
  if (!includeArchived) filter.isArchived = { $ne: true }
  return this.find(filter).sort({ lastMessageAt: -1, updatedAt: -1 }).limit(limit).lean()
}

// 静态: 找一条 (校验归属)
AgentConversationSchema.statics.findForUser = function ({ id, userId, orgId }) {
  return this.findOne({ _id: id, user: userId, org: orgId })
}

module.exports = mongoose.model('AgentConversation', AgentConversationSchema)
