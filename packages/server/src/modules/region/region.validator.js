'use strict'

const { body, param } = require('express-validator')

const create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('名称 1-50 字'),
  body('code').optional().isString().isLength({ max: 50 }),
  body('parent').optional({ nullable: true }).isMongoId(),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean()
]

const update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('code').optional().isString().isLength({ max: 50 }),
  body('parent').optional({ nullable: true }).isMongoId(),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean()
]

const idParam = [param('id').isMongoId()]

module.exports = { create, update, idParam }
