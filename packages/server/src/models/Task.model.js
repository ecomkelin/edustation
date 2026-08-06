'use strict'

const { Schema, model } = require('mongoose')

/**
 * 任务（Task）— 员工任务模块的主表
 *
 * 业务核心：
 *   - 三角色协作：creator (发起人) / assignees (执行人, 多人) / supervisors (监督人, 必填 1 个)
 *   - 多执行人各自勾选 checklist (TaskItem) 中的子集;状态机按"全员提交才进 submitted"
 *   - 监督人对 submitted 状态任务进行审批;打回后回到 in_progress,留痕在 TaskReview
 *
 * ─── 状态机 ────────────────────────────────────────
 *   draft                  草稿（仅发起人可见）
 *   assigned               已分配（无人在做）
 *   in_progress            进行中（至少 1 个执行人已开始）
 *   partial_submitted      部分提交（部分执行人已 submitted）
 *   submitted              全员已提交（待监督人审）
 *   approved               已通过（终态）
 *   rejected               已打回（监督人打回,业务上等同 in_progress）
 *   expired                已逾期（cron 标记;终态）
 *   cancelled              已取消（发起人取消;终态）
 *
 * ─── 个人状态 (Task.assignees[i].status) ──────────
 *   not_started            未开始
 *   in_progress            进行中（至少勾过 1 个自己的条目）
 *   submitted              已提交完成（自己所有条目 done）
 *
 * ─── 进度 (Task.progress) ──────────────────────
 *   0~100, 由 service 层聚合 TaskItem.done_count / total_count 后写回;
 *   列表/看板读取时不用每次重算.
 */
const TaskAssigneeSchema = new Schema(
  {
    // 执行人 User
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 个人状态
    status: {
      type: String,
      enum: ['not_started', 'in_progress', 'submitted'],
      default: 'not_started'
    },
    // 个人提交时间（status=submitted 时填写）
    submittedAt: { type: Date, default: null },
    // 个人进度（0~100, service 写入,看板/统计快速读取）
    progress: { type: Number, default: 0, min: 0, max: 100 }
  },
  { _id: false }
)

const TaskSchema = new Schema(
  {
    // 所属机构（多租户隔离）
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 标题
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // 描述（markdown / plain text）
    description: { type: String, default: '', maxlength: 5000 },
    // 任务类型
    type: {
      type: String,
      enum: ['admin', 'teaching', 'recruiting', 'finance', 'marketing', 'facility', 'other'],
      default: 'other'
    },
    // 优先级
    priority: {
      type: String,
      enum: ['low', 'normal', 'high', 'urgent'],
      default: 'normal'
    },
    // 发起人
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 执行人列表（≥1, MVP 不允许自由认领）
    assignees: {
      type: [TaskAssigneeSchema],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length > 0, '任务至少包含 1 个执行人']
    },
    // 监督人列表（必填 1 个; 默认 = creator）
    supervisors: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      required: true,
      validate: [(v) => Array.isArray(v) && v.length > 0, '任务必须指定至少 1 个监督人']
    },
    // 开始时间（可选;为空时 = 创建时间）
    startAt: { type: Date, default: null },
    // 到期时间（必填;过期后由 cron 标记为 expired）
    dueAt: { type: Date, required: true },
    // 状态
    status: {
      type: String,
      enum: [
        'draft', 'assigned', 'in_progress', 'partial_submitted',
        'submitted', 'approved', 'rejected', 'expired', 'cancelled'
      ],
      default: 'assigned'
    },
    // 整体进度（0~100）
    progress: { type: Number, default: 0, min: 0, max: 100 },
    // 自由标签
    tags: { type: [String], default: [] },
    // 关联的业务实体（跳转上下文）:{ entity: 'lead' | 'order' | 'courseInstance' ..., id: ObjectId }
    relatedTo: {
      entity: { type: String, default: null },
      id: { type: Schema.Types.ObjectId, default: null }
    },
    // 是否由周期模板生成（便于追溯）
    fromTemplate: { type: Schema.Types.ObjectId, ref: 'TaskTemplate', default: null },
    // ─── 归档 (2026-07-08) ──────────────────────────────
    //   业务硬门: 终态 (approved/cancelled/expired) 仍可被引用 (统计 / 财务 / 退课溯源);
    //   物理删除走 §8.1 三重防护, 但「不想再看到」就用归档:
    //     - archived=true: list / kanban / stats 默认不返; 详情 403 '已归档, 不可操作'
    //     - 反归档可逆 (unarchive 端点), 适合"误归档/需要再拿出来"
    //     - 与 status=approved 不同: 业务终态表达"任务结束了", archived 表达"运维上不再活跃"
    //   触发: 超管 / task.delete 持有者手动归档; 或 cron 把"approved/cancelled/expired + dueAt<90d前"自动归档
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // 扩展属性
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'tasks' }
)

// ─── 索引 ────────────────────────────────────────
// 列表:按机构 + 状态 + 到期时间排序(看板/列表主索引)
TaskSchema.index({ org: 1, status: 1, dueAt: 1 })
// 列表:按机构 + 创建时间(默认排序)
TaskSchema.index({ org: 1, createdAt: -1 })
// 我创建的
TaskSchema.index({ org: 1, creator: 1 })
// 我执行的(数组字段索引)
TaskSchema.index({ org: 1, 'assignees.user': 1 })
// 我监督的(数组字段索引)
TaskSchema.index({ org: 1, supervisors: 1 })
// 到期扫描(cron 用: 找 dueAt < now 且未到终态的任务)
TaskSchema.index({ status: 1, dueAt: 1 })
// 模板追溯
TaskSchema.index({ fromTemplate: 1 })
// 归档过滤主索引: list / kanban / stats 默认 archived=false
TaskSchema.index({ org: 1, archived: 1, status: 1, dueAt: 1 })
// 2026-08-06 P1.1/P2.1: 标签筛选 (list chip ?tag= + 多选 ?tags=) + P1.2 distinctTags
//   multikey 索引, 数组字段走它, 避免全表扫
TaskSchema.index({ org: 1, tags: 1 })

module.exports = model('Task', TaskSchema)