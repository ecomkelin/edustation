'use strict'

const { body, query, param } = require('express-validator')
const {
  TASK_STATUSES,
  TASK_TYPES,
  TASK_PRIORITIES,
  TASK_REVIEW_RESULTS,
  TASK_SCHEDULE_KINDS
} = require('@shared/enums')

/**
 * 任务模块校验器集合
 *
 * 命名约定: 创建任务用 create; 修改任务用 update; 子操作各自独立链.
 * 列表/详情/操作类端点的参数校验放对应位置(list / submit / review ...).
 */

// ─── 创建任务 ─────────────────────────────────────────
const create = [
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('type').optional().isIn(TASK_TYPES),
  body('priority').optional().isIn(TASK_PRIORITIES),
  body('assignees').isArray({ min: 1 }).withMessage('至少 1 个执行人'),
  body('assignees.*').isMongoId().withMessage('assignees 必须是 User._id 数组'),
  body('supervisors').isArray({ min: 1 }).withMessage('至少 1 个监督人'),
  body('supervisors.*').isMongoId(),
  body('startAt').optional({ nullable: true }).isISO8601(),
  body('dueAt').isISO8601().withMessage('dueAt 必填且为 ISO8601 时间'),
  body('tags').optional().isArray(),
  body('tags.*').optional().isString().isLength({ max: 30 }),
  body('relatedTo.entity').optional().isString().isLength({ max: 50 }),
  body('relatedTo.id').optional({ nullable: true }).isMongoId(),
  // checklist 条目: 可选,若传则每项必填 title + assignee
  body('items').optional().isArray(),
  body('items.*.title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('items.*.assignee').isMongoId(),
  body('items.*.order').optional().isInt({ min: 0 })
]

// ─── 编辑任务 ─────────────────────────────────────────
const update = [
  body('title').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('type').optional().isIn(TASK_TYPES),
  body('priority').optional().isIn(TASK_PRIORITIES),
  body('assignees').optional().isArray({ min: 1 }),
  body('assignees.*').optional().isMongoId(),
  body('supervisors').optional().isArray({ min: 1 }),
  body('supervisors.*').optional().isMongoId(),
  body('startAt').optional({ nullable: true }).isISO8601(),
  body('dueAt').optional().isISO8601(),
  body('tags').optional().isArray(),
  body('tags.*').optional().isString().isLength({ max: 30 }),
  body('status').optional().isIn(TASK_STATUSES).withMessage('状态值非法')
]

// ─── 列表查询 ─────────────────────────────────────────
const list = [
  query('status').optional().isIn(TASK_STATUSES),
  query('type').optional().isIn(TASK_TYPES),
  query('priority').optional().isIn(TASK_PRIORITIES),
  query('assignee').optional().isMongoId(),
  query('creator').optional().isMongoId(),
  query('supervisor').optional().isMongoId(),
  // myRole: creator / assignee / supervisor / mentioned / all
  query('myRole').optional().isIn(['creator', 'assignee', 'supervisor', 'mentioned', 'all']),
  query('keyword').optional().isString().isLength({ max: 100 }),
  query('dueBefore').optional().isISO8601(),
  query('dueAfter').optional().isISO8601(),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 200 })
]

// ─── 监督人审批 ───────────────────────────────────────
const review = [
  body('result').isIn(TASK_REVIEW_RESULTS).withMessage('result 必须是 approved/rejected/requested_changes'),
  body('comment').optional().isString().isLength({ max: 2000 }),
  body('score').optional({ nullable: true }).isInt({ min: 1, max: 5 })
]

// ─── 取消任务 ─────────────────────────────────────────
const cancel = [
  body('reason').optional().isString().isLength({ max: 500 })
]

// ─── 勾/改条目 ────────────────────────────────────────
const toggleItem = [
  body('done').isBoolean(),
  // 重新分配（可选）
  body('assignee').optional().isMongoId()
]

// ─── 加条目 ────────────────────────────────────────────
const addItem = [
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('assignee').isMongoId(),
  body('order').optional().isInt({ min: 0 })
]

// ─── 加评论 ────────────────────────────────────────────
const addComment = [
  body('content').isString().trim().notEmpty().isLength({ max: 2000 }),
  body('mentions').optional().isArray(),
  body('mentions.*').optional().isMongoId()
]

// ─── 看板 ──────────────────────────────────────────────
const kanban = [
  query('assignee').optional().isMongoId(),
  query('type').optional().isIn(TASK_TYPES),
  query('priority').optional().isIn(TASK_PRIORITIES),
  query('scope').optional().isIn(['mine', 'all']) // mine = 只看我相关的;all = org 全部
]

// ─── 模板：创建 ────────────────────────────────────────
const templateCreate = [
  body('title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('type').optional().isIn(TASK_TYPES),
  body('priority').optional().isIn(TASK_PRIORITIES),
  body('defaultAssignees').isArray({ min: 1 }),
  body('defaultAssignees.*.user').isMongoId(),
  body('defaultSupervisors').isArray({ min: 1 }),
  body('defaultSupervisors.*').isMongoId(),
  body('itemTemplates').optional().isArray(),
  body('itemTemplates.*.title').isString().trim().notEmpty().isLength({ max: 200 }),
  body('itemTemplates.*.assigneeRole').optional().isString().isLength({ max: 50 }),
  body('itemTemplates.*.order').optional().isInt({ min: 0 }),
  body('schedule').exists(),
  body('schedule.kind').isIn(TASK_SCHEDULE_KINDS),
  body('schedule.hour').optional().isArray(),
  body('schedule.hour.*').optional().isInt({ min: 0, max: 23 }),
  body('schedule.weekdays').optional().isArray(),
  body('schedule.weekdays.*').optional().isInt({ min: 0, max: 6 }),
  body('schedule.daysOfMonth').optional().isArray(),
  body('schedule.daysOfMonth.*').optional().isInt({ min: 1, max: 31 }),
  body('schedule.cron').optional().isString().isLength({ max: 100 }),
  body('schedule.startAt').optional({ nullable: true }).isISO8601(),
  body('schedule.endAt').optional({ nullable: true }).isISO8601(),
  body('isActive').optional().isBoolean()
]

// ─── 模板：更新 ────────────────────────────────────────
const templateUpdate = [
  body('title').optional().isString().trim().notEmpty().isLength({ max: 200 }),
  body('description').optional().isString().isLength({ max: 5000 }),
  body('type').optional().isIn(TASK_TYPES),
  body('priority').optional().isIn(TASK_PRIORITIES),
  body('defaultAssignees').optional().isArray({ min: 1 }),
  body('defaultAssignees.*.user').optional().isMongoId(),
  body('defaultSupervisors').optional().isArray({ min: 1 }),
  body('defaultSupervisors.*').optional().isMongoId(),
  body('itemTemplates').optional().isArray(),
  body('schedule').optional().exists(),
  body('schedule.kind').optional().isIn(TASK_SCHEDULE_KINDS),
  body('schedule.hour').optional().isArray(),
  body('schedule.weekdays').optional().isArray(),
  body('schedule.daysOfMonth').optional().isArray(),
  body('schedule.cron').optional().isString().isLength({ max: 100 }),
  body('isActive').optional().isBoolean()
]

module.exports = {
  create,
  update,
  list,
  review,
  cancel,
  toggleItem,
  addItem,
  addComment,
  kanban,
  templateCreate,
  templateUpdate
}