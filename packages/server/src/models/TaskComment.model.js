'use strict'

const { Schema, model } = require('mongoose')

/**
 * 任务评论（TaskComment）— 任务协作的评论/讨论流
 *
 * 支持 @mention: 解析 `content` 中的 `@昵称` 标记,把被 @ 的用户存到 `mentions`
 * 数组,通知服务据此推送站内消息.
 *
 * 不做二级回复(扁平结构,如有需要 service 层按 createdAt 排序即可).
 * 评论独立 collection 而非子文档,避免任务详情接口一次性拉太多.
 */
const TaskCommentSchema = new Schema(
  {
    // 所属任务
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 评论人
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 评论内容（plain text;2026-07-08 MVP 不支持 markdown）
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    // 被 @ 的用户列表（解析 @昵称 后写入,通知中心用）
    mentions: { type: [Schema.Types.ObjectId], default: [], ref: 'User' }
  },
  { timestamps: true, collection: 'task_comments' }
)

// 任务详情: 按时间正序拉评论流
TaskCommentSchema.index({ task: 1, createdAt: 1 })

module.exports = model('TaskComment', TaskCommentSchema)