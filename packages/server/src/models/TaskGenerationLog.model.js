'use strict'

const { Schema, model } = require('mongoose')

/**
 * 任务生成流水（TaskGenerationLog）— 周期模板生成 Task 实例的全审计
 *
 * 每次 scheduler 触发一次模板生成,无论成功失败都记一条:
 *   - status: 'success' | 'failed'
 *   - task:   生成出来的 Task _id (成功时)
 *   - error:  失败原因 (失败时)
 *
 * 便于排查"为什么这个周期的任务没生成"、"为什么生成出来不对".
 */
const TaskGenerationLogSchema = new Schema(
  {
    // 触发的模板
    template: { type: Schema.Types.ObjectId, ref: 'TaskTemplate', required: true, index: true },
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 生成出来的任务（成功时填写）
    task: { type: Schema.Types.ObjectId, ref: 'Task', default: null },
    // 触发时刻
    runAt: { type: Date, default: Date.now },
    // 结果
    status: { type: String, enum: ['success', 'failed'], required: true },
    // 失败原因
    error: { type: String, default: null, maxlength: 2000 },
    // 触发周期（便于多模板同 tick 时区分）
    scheduledFor: { type: Date, default: null }
  },
  { timestamps: true, collection: 'task_generation_logs' }
)

// 模板历史查询
TaskGenerationLogSchema.index({ template: 1, runAt: -1 })

module.exports = model('TaskGenerationLog', TaskGenerationLogSchema)