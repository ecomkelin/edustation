'use strict'

const { Schema, model } = require('mongoose')

/**
 * 任务条目（TaskItem）— 任务下的可勾选 checklist 行
 *
 * 与 Task 是 1:N 关系（独立 collection 而非子文档）：
 *   - 业务上条目可能被独立勾选/取消勾选/重新分配,需要按 _id 寻址
 *   - 列表按 task 一次拉全,数据量小(常见 < 50 条/任务)
 *   - 进度计算: Task.progress = done_count / total_count (service 层聚合)
 *
 * 每个条目归属 1 个具体的执行人 (`assignee`),不允许"自由认领",
 * 多人协作场景下: Task.assignees[i] 各自勾选自己负责的子集条目.
 *
 * `doneBy` 与 `doneAt` 记录"是谁/何时勾的",便于审计与监督人复核.
 */
const TaskItemSchema = new Schema(
  {
    // 所属任务
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    // 所属机构（多租户隔离;冗余便于按 org 直接统计/筛选）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 条目文案
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // 该条目分配给的执行人（必填,创建时校验 ⊂ Task.assignees）
    assignee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 是否勾选
    done: { type: Boolean, default: false },
    // 谁勾的（done=true 时必填,service 写入）
    doneBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 勾选时间
    doneAt: { type: Date, default: null },
    // 排序（同一 task 内由小到大展示;创建时按传入顺序写入）
    order: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true, collection: 'task_items' }
)

// 按 task 拉全条目（详情页 + 进度计算）
TaskItemSchema.index({ task: 1, order: 1 })
// 按 assignee 拉"我的条目"(跨任务聚合,统计/看板用)
TaskItemSchema.index({ org: 1, assignee: 1, done: 1 })

module.exports = model('TaskItem', TaskItemSchema)