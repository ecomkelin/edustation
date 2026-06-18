'use strict'

/**
 * AI 助手 - 会话消息
 *
 * 集合: agent_messages
 *
 * 业务定位:
 *  - 一次 chat 中的单条消息 (user / assistant / tool)
 *  - 严格属于某 user + org + conversation, 别人不可见
 *  - content 用 Mixed 存 "blocks 数组" (与前端保持一致结构):
 *      [{type:'text', content:'...'}, {type:'file', ...}, {type:'tool_call', ...}, ...]
 *  - toolCalls 单独列出来便于审计 / 摘要
 *
 * 索引:
 *  - { conversation, seq } 唯一 (按会话顺序拉取)
 *  - { user, org, createdAt } 主列表 / 跨会话追溯
 *
 * 设计取舍:
 *  - 不存 attachments 原始 buffer (附件已存 storage.files, fileId 引用)
 *  - 不存 LLM token / raw response (由 conversation 末次 usage 兜底)
 *  - assistant 的 tool_calls 在 blocks 内, 不重复存
 */

const mongoose = require('mongoose')

const AgentMessageSchema = new mongoose.Schema(
  {
    org: { type: mongoose.Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AgentConversation',
      required: true,
      index: true
    },

    // 顺序号 (在 conversation 内自增, 1..N)
    seq: { type: Number, required: true },

    // 'user' | 'assistant' | 'tool' | 'system' (system 几乎不用, 留作兼容)
    role: { type: String, enum: ['user', 'assistant', 'tool', 'system'], required: true },

    // 内容 (与前端 blocks 结构一致)
    content: { type: mongoose.Schema.Types.Mixed, default: [] },

    // 工具调用摘要 (assistant 消息可能含 tool_calls block, 这里再列一次便于审计)
    toolCalls: { type: mongoose.Schema.Types.Mixed, default: null },
    toolCallId: { type: String, default: null, index: true }, // tool role 时关联 assistant 的 tool_call.id

    // 关联到具体业务对象 (assistant 调 create_order 后, 落 Order._id, 便于回溯)
    businessRefs: { type: mongoose.Schema.Types.Mixed, default: null },

    // 错误标记
    hasError: { type: Boolean, default: false },
    errorMessage: { type: String, default: '' },

    // 软删标记 (2026-06-18): 跟随父 conversation 一并软删
    //  - 删除会话 → messages 同步 isDeleted=true
    //  - 非超管 listByConversation 自动过滤 isDeleted=true
    //  - 超管管理面板拉详情时不过滤
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },

    // 时间
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: false, collection: 'agent_messages' }
)

// 唯一索引: (conversation, seq) 防止并发写入错序
AgentMessageSchema.index({ conversation: 1, seq: 1 }, { unique: true })

// 复合索引
AgentMessageSchema.index({ user: 1, org: 1, createdAt: -1 })

// 静态: 拉取会话所有消息 (按 seq 升序)
AgentMessageSchema.statics.listByConversation = function ({ conversationId, userId, orgId, includeDeleted = false }) {
  const filter = { conversation: conversationId, user: userId, org: orgId }
  if (!includeDeleted) filter.isDeleted = { $ne: true }
  return this.find(filter)
    .sort({ seq: 1 })
    .lean()
}

module.exports = mongoose.model('AgentMessage', AgentMessageSchema)
