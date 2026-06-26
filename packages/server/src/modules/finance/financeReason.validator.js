'use strict'

const { body, param, query } = require('express-validator')

const idParam = [
  param('id').isMongoId().withMessage('id 必须是合法的 ObjectId')
]

const listReasons = [
  query('direction').optional().isIn(['in', 'out']).withMessage('direction 必须是 in/out'),
  query('isActive').optional().isIn(['true', 'false'])
]

const createReason = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('name 1-50 字'),
  body('direction').isIn(['in', 'out']).withMessage('direction 必填 (in 收入 / out 支出)'),
  body('category').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean(),
  body('code').optional({ values: 'falsy' }).isString().isLength({ max: 50 })
]

const updateReason = [
  param('id').isMongoId(),
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('direction').optional().isIn(['in', 'out']),
  body('category').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean(),
  body('code').optional({ values: 'falsy' }).isString().isLength({ max: 50 })
]

module.exports = { idParam, listReasons, createReason, updateReason }
