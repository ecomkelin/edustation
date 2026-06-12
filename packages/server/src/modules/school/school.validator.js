'use strict'

const { body } = require('express-validator')
const { SCHOOL_TYPES } = require('@shared/enums')

// HH:MM 24h 字符串
const TIME_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

exports.create = [
  body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('学校名必填 (1-100)'),
  body('type').optional().isIn(SCHOOL_TYPES).withMessage(`学段必须是 ${SCHOOL_TYPES.join('/')}`),
  body('address').optional().isString().isLength({ max: 200 }),
  body('exitCount').optional().isInt({ min: 0 }).withMessage('出口数量必须为非负整数'),
  body('weekdayDismissal').optional().matches(TIME_HHMM).withMessage('weekdayDismissal 必须是 HH:MM 格式'),
  body('fridayDismissal').optional().matches(TIME_HHMM).withMessage('fridayDismissal 必须是 HH:MM 格式'),
  body('notes').optional().isString().isLength({ max: 500 })
]

exports.update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('type').optional().isIn(SCHOOL_TYPES),
  body('address').optional().isString().isLength({ max: 200 }),
  body('exitCount').optional().isInt({ min: 0 }),
  body('weekdayDismissal').optional().matches(TIME_HHMM),
  body('fridayDismissal').optional().matches(TIME_HHMM),
  body('notes').optional().isString().isLength({ max: 500 }),
  body('isActive').optional().isBoolean()
]
