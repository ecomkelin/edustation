'use strict'

const { body, param } = require('express-validator')

const create = [
  body('model').isIn(['Org', 'Student', 'Subject']).withMessage('model 不合法'),
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('名称 1-50 字'),
  body('parentCategory').optional({ nullable: true }).isMongoId(),
  body('code').optional().isString().isLength({ max: 50 }),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean()
]

const update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('parentCategory').optional({ nullable: true }).isMongoId(),
  body('code').optional().isString().isLength({ max: 50 }),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean()
]

const idParam = [param('id').isMongoId()]

module.exports = { create, update, idParam }
