'use strict'

const { body } = require('express-validator')
const { GENDERS } = require('@shared/enums')

const create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('姓名必填 (1-50)'),
  body('gender').optional().isIn(GENDERS),
  body('birthday').optional().isISO8601().withMessage('birthday 必须是日期'),
  body('guardianMobile').optional().isString().isLength({ min: 11, max: 11 }),
  body('guardians').optional().isArray(),
  body('guardians.*').optional().isMongoId(),
  body('notes').optional().isString().isLength({ max: 500 })
]

const update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('gender').optional().isIn(GENDERS),
  body('birthday').optional().isISO8601(),
  body('guardians').optional().isArray(),
  body('guardians.*').optional().isMongoId(),
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

module.exports = { create, update, setGuardians, setBlocked }
