'use strict'

const { Schema, model } = require('mongoose')

/**
 * 任务模板（TaskTemplate）— 周期/重复任务的定义
 *
 * 业务核心:
 *   - 把 Task 的"内容字段"模板化（标题/描述/类型/优先级/checklist/默认执行人）
 *   - schedule 子文档定义生成周期（每天/每周/每月/cron）
 *   - 服务端定时任务扫描 nextRunAt <= now 的模板,生成 Task 实例
 *
 * ─── schedule 规则 ─────────────────────────────
 *   daily:   每天的 hour(0-23) 数组生成;hour 空 = 每个整点都生成
 *   weekly:  每周的 weekdays(0-6, 0=周日) + hour 生成
 *   monthly: 每月的 daysOfMonth(1-31) + hour 生成
 *   cron:    [TODO 阶段 2] cron 表达式
 *
 * ─── 默认执行人/监督人 ──────────────────────────
 *   模板生成时复制到 Task;后续手工调整不影响模板.
 *   - defaultAssignees[].assignment: 'fixed' (固定 user) | 'role' (按角色解析,阶段 2)
 *
 * ─── itemTemplates ──────────────────────────────
 *   每条: { title, assigneeRole, order }
 *   assigneeRole = null 表示分配给 defaultAssignees[0] (即默认交给第一个执行人);
 *   复杂分发留口子,阶段 2 再细化.
 */
const TaskTemplateItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // 该条目分配给哪个执行人角色；null = defaultAssignees[0]（留口子，阶段 2 实现按 role 解析）
    assigneeRole: { type: String, default: null },
    // 排序
    order: { type: Number, default: 0, min: 0 }
  },
  { _id: false }
)

const TaskTemplateAssigneeSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 预留给阶段 2: 按角色解析时记录 role key,生成时再查找实际 user
    role: { type: String, default: null }
  },
  { _id: false }
)

const TaskScheduleSchema = new Schema(
  {
    // 类型: daily / weekly / monthly / cron
    kind: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'cron'],
      required: true
    },
    // 生成时刻(0-23);空数组 = 每个整点
    hour: { type: [Number], default: [] },
    // weekly: 0-6 (0=周日)
    weekdays: { type: [Number], default: [] },
    // monthly: 1-31
    daysOfMonth: { type: [Number], default: [] },
    // cron 表达式（kind=cron 时使用）
    cron: { type: String, default: null },
    // 周期生效起止（可选）
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null }
  },
  { _id: false }
)

const TaskTemplateSchema = new Schema(
  {
    // 所属机构
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 模板标题/描述
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 5000 },
    // 任务类型/优先级（生成时套用到 Task）
    type: {
      type: String,
      enum: ['admin', 'teaching', 'recruiting', 'finance', 'marketing', 'facility', 'other'],
      default: 'other'
    },
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },
    // 默认执行人（生成时复制为 Task.assignees）
    defaultAssignees: { type: [TaskTemplateAssigneeSchema], default: [] },
    // 默认监督人（必填 1 个）
    defaultSupervisors: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length > 0, '模板必须指定至少 1 个监督人']
    },
    // 条目模板
    itemTemplates: { type: [TaskTemplateItemSchema], default: [] },
    // 2026-08-06 P3.1: 默认标签 — generateFromTemplate 写入生成任务的 tags, 兜底 ['周期任务'] 保后向兼容
    defaultTags: { type: [String], default: [] },
    // 周期规则
    schedule: { type: TaskScheduleSchema, required: true },
    // 下次生成时间（定时任务扫描这个字段；null = 未启用或已结束）
    nextRunAt: { type: Date, default: null },
    // 上次生成时间
    lastRunAt: { type: Date, default: null },
    // 是否启用（false 时 scheduler 跳过）
    isActive: { type: Boolean, default: true },
    // 创建人
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 扩展属性
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'task_templates' }
)

// scheduler 主索引：找 nextRunAt <= now 且启用的模板
TaskTemplateSchema.index({ isActive: 1, nextRunAt: 1 })
// 按机构 + 创建时间
TaskTemplateSchema.index({ org: 1, createdAt: -1 })

module.exports = model('TaskTemplate', TaskTemplateSchema)