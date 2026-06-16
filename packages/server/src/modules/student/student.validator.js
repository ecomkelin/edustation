'use strict'

const { body, param } = require('express-validator')
const { GENDERS } = require('@shared/enums')

const create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('姓名必填 (1-50)'),
  body('gender').optional().isIn(GENDERS),
  body('birthday').optional().isISO8601().withMessage('birthday 必须是日期'),
  body('guardianMobile').optional().isString().isLength({ min: 11, max: 11 }),
  body('guardians').optional().isArray(),
  body('guardians.*').optional().isMongoId(),
  body('school').optional({ nullable: true }).isMongoId().withMessage('school 必须是学校 id 或 null'),
  body('notes').optional().isString().isLength({ max: 500 })
]

const update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('gender').optional().isIn(GENDERS),
  body('birthday').optional().isISO8601(),
  body('guardians').optional().isArray(),
  body('guardians.*').optional().isMongoId(),
  body('school').optional({ nullable: true }).isMongoId(),
  body('notes').optional().isString().isLength({ max: 500 }),
  body('isActive').optional().isBoolean()
]

const setGuardians = [
  body('guardians').isArray().withMessage('guardians 必须是数组'),
  body('guardians.*').isMongoId()
]

const setBlocked = [
  body('isBlocked').optional().isBoolean(),
  body('reason').optional().isString().isLength({ max: 500 })
]

/**
 * 学生学习画像 (2026-06 新增) — 6 个结构化字段
 * 与 notes (过敏史/特殊需求/老师注意事项) 完全独立, 互不影响
 */
const setProfile = [
  body('personality').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('性格不能超过 500 字'),
  body('learningGoal').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('学习目标不能超过 500 字'),
  body('weakness').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('薄弱项不能超过 500 字'),
  body('classFeedback').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('上课反馈不能超过 500 字'),
  body('strengths').optional({ nullable: true }).isString().isLength({ max: 500 }).withMessage('特长不能超过 500 字'),
  body('followUp').optional({ nullable: true }).isString().isLength({ max: 2000 }).withMessage('跟进备忘不能超过 2000 字')
]

const idParam = [
  param('id').isMongoId().withMessage('id 需为合法 id')
]

module.exports = { create, update, setGuardians, setBlocked, setProfile, idParam }
