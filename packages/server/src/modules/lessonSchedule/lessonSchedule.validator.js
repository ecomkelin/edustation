'use strict'

const { body, query } = require('express-validator')
const { LESSON_SCHEDULE_STATUSES } = require('@shared/enums')

const create = [
  body('courseInstance').isMongoId(),
  // 2026-07-06 bugfix: lessonNo 改为可选 — 不传时后端自动取 max(lessonNo)+1
  // 历史 bug: 原版强制要求传, 前端用 scheduledCount(=countDocuments)推算, 删除几节后 +1 会与现有 lessonNo 撞唯一索引
  body('lessonNo').optional().isInt({ min: 1 }),
  body('plannedStartTime').isISO8601(),
  body('plannedEndTime').isISO8601(),
  body('teacher').isMongoId(),
  body('room').isMongoId(),
  body('status').optional().isIn(LESSON_SCHEDULE_STATUSES),
  body('title').optional().isString().isLength({ max: 100 }),
  body('notes').optional().isString().isLength({ max: 500 }),
  // 招生试听 (2026-06): 是否试听课 (true 时 courseInstance 必须是 [试听专用] 开班)
  body('isTrialLesson').optional().isBoolean()
]

const update = [
  body('courseInstance').optional().isMongoId(),
  body('lessonNo').optional().isInt({ min: 1 }),
  body('plannedStartTime').optional().isISO8601(),
  body('plannedEndTime').optional().isISO8601(),
  body('teacher').optional().isMongoId(),
  body('room').optional().isMongoId(),
  body('status').optional().isIn(LESSON_SCHEDULE_STATUSES),
  body('title').optional().isString().isLength({ max: 100 }),
  body('notes').optional().isString().isLength({ max: 500 }),
  // 实际时间（编辑对话框用）
  body('actualStartTime').optional({ nullable: true }).isISO8601(),
  body('actualEndTime').optional({ nullable: true }).isISO8601(),
  // 5 分钟差异理由（≥5 分钟必填，由 service 强校验）
  body('actualStartReason').optional({ nullable: true }).isString().isLength({ max: 500 }),
  body('actualEndReason').optional({ nullable: true }).isString().isLength({ max: 500 }),
  // 教学体系(2026-06 拆): 本节特例覆盖
  body('descriptionOverride').optional({ nullable: true }).isString().isLength({ max: 5000 }),
  body('objectivesOverride').optional().isArray().isLength({ max: 50 }),
  body('objectivesOverride.*').optional().isString().isLength({ max: 200 })
]

// 开始上课：可选传 actualStartTime（教务补录晚开课）/ actualStartReason
// 2026-07-09: 跟 finish 对称, 允许弹框改时间 + 填理由
const start = [
  body('actualStartTime').optional({ nullable: true }).isISO8601(),
  body('actualStartReason').optional({ nullable: true }).isString().isLength({ max: 500 })
]

// 结束上课：可选传 actualEndTime（教务补录）/ actualEndReason
const finish = [
  body('actualEndTime').optional({ nullable: true }).isISO8601(),
  body('actualEndReason').optional({ nullable: true }).isString().isLength({ max: 500 })
]

// 批量预览：除常规字段外，可选 count 限制返回条数
const preview = [
  body('courseInstance').isMongoId(),
  body('startDate').isISO8601(),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime 必须是 HH:mm'),
  body('endTime').matches(/^\d{2}:\d{2}$/).withMessage('endTime 必须是 HH:mm'),
  body('teacher').optional().isMongoId(),
  body('room').optional().isMongoId(),
  body('title').optional().isString().isLength({ max: 100 }),
  body('count').optional().isInt({ min: 1, max: 500 })
]

// 批量生成
// 2026-07-06 用户决策: 预览表支持改时间/老师/教室 (主题列已下线)
//   - titleMap: 历史字段 (2026-06 旧版), 后端仍兜底兼容
//   - entriesMap: 新版按 lessonNo 覆盖单个排课的元数据, 未在本表中的节用全局默认值
//     shape: { [lessonNo: number]: { startTime?: 'HH:mm', endTime?: 'HH:mm', teacher?: ObjectId, room?: ObjectId } }
//   - keepLessonNos: 2026-07-06 bugfix — 前端预览删除某些行后, 后端需要知道哪些 lessonNo 保留,
//     否则会被 schedulePlan 重算"复活". 元素为正整数 lessonNo; 不传则保留全部 (向后兼容).
const generate = [
  body('courseInstance').isMongoId(),
  body('startDate').isISO8601(),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime 必须是 HH:mm'),
  body('endTime').matches(/^\d{2}:\d{2}$/).withMessage('endTime 必须是 HH:mm'),
  body('teacher').optional().isMongoId(),
  body('room').optional().isMongoId(),
  body('title').optional().isString().isLength({ max: 100 }),
  body('titleMap').optional().isObject(),
  body('titleMap.*').optional().isString().isLength({ max: 100 }),
  body('entriesMap').optional().isObject(),
  body('entriesMap.*').optional().isObject(),
  body('entriesMap.*.startTime').optional().matches(/^\d{2}:\d{2}$/),
  body('entriesMap.*.endTime').optional().matches(/^\d{2}:\d{2}$/),
  body('entriesMap.*.teacher').optional().isMongoId(),
  body('entriesMap.*.room').optional().isMongoId(),
  body('keepLessonNos').optional().isArray({ min: 1 }),
  body('keepLessonNos.*').optional().isInt({ min: 1 })
]

// 冲突预检（GET /conflicts）：用 query 传参
const conflicts = [
  query('plannedStartTime').isISO8601(),
  query('plannedEndTime').isISO8601(),
  query('teacher').optional().isMongoId(),
  query('room').optional().isMongoId(),
  query('excludeId').optional().isMongoId()
]

module.exports = { create, update, start, finish, preview, generate, conflicts }
