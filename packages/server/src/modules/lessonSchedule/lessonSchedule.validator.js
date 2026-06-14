'use strict'

const { body, query } = require('express-validator')
const { LESSON_SCHEDULE_STATUSES } = require('@shared/enums')

const create = [
  body('courseInstance').isMongoId(),
  body('lessonNo').isInt({ min: 1 }),
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
const generate = [
  body('courseInstance').isMongoId(),
  body('startDate').isISO8601(),
  body('startTime').matches(/^\d{2}:\d{2}$/).withMessage('startTime 必须是 HH:mm'),
  body('endTime').matches(/^\d{2}:\d{2}$/).withMessage('endTime 必须是 HH:mm'),
  body('teacher').optional().isMongoId(),
  body('room').optional().isMongoId(),
  body('title').optional().isString().isLength({ max: 100 }),
  // 每节主题覆盖：{ [lessonNo: number]: string }
  body('titleMap').optional().isObject(),
  body('titleMap.*').optional().isString().isLength({ max: 100 })
]

// 冲突预检（GET /conflicts）：用 query 传参
const conflicts = [
  query('plannedStartTime').isISO8601(),
  query('plannedEndTime').isISO8601(),
  query('teacher').optional().isMongoId(),
  query('room').optional().isMongoId(),
  query('excludeId').optional().isMongoId()
]

module.exports = { create, update, finish, preview, generate, conflicts }
