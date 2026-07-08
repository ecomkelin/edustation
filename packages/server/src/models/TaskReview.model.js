'use strict'

const { Schema, model } = require('mongoose')

/**
 * 任务核查记录（TaskReview）— 监督人对任务审批的全审计
 *
 * 关键设计: 每次监督人操作都留一条记录,**不覆盖**前一次.
 *   - 任务可以「打回 → 再交 → 再批」,多次往返的链路必须可追溯.
 *   - service 层在 Task 上只更新 status;具体的"上一次结果"由本表 latest 推断.
 *
 * 业务规则:
 *   - result=approved  → 任务状态进入 approved (终态,除非被人工重开)
 *   - result=rejected  → 任务回到 in_progress;记录留痕
 *   - result=requested_changes → 视为"打回但需要修改意见",等同 rejected 回到 in_progress
 */
const TaskReviewSchema = new Schema(
  {
    // 所属任务
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 核查人（监督人列表中的某个 User）
    reviewer: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 核查结果
    result: {
      type: String,
      enum: ['approved', 'rejected', 'requested_changes'],
      required: true
    },
    // 评语（可选,但 rejected / requested_changes 强烈建议填）
    comment: { type: String, default: '', maxlength: 2000 },
    // 可选评分（1-5 星,管理层 review 时打;员工自评不一定用）
    score: { type: Number, min: 1, max: 5, default: null },
    // 核查时间
    reviewedAt: { type: Date, default: Date.now }
  },
  { timestamps: true, collection: 'task_reviews' }
)

// 任务详情:按时间倒序拉核查历史
TaskReviewSchema.index({ task: 1, reviewedAt: -1 })

module.exports = model('TaskReview', TaskReviewSchema)