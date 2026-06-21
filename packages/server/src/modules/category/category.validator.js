'use strict'

const { body, param } = require('express-validator')

// 2026-06 整改: model enum 移除 'Org' (Org.type 已改 String enum);
// 5 个 model 全是 per-org 业务字典 (2026-06-21 加 PointsReason).
const ALLOWED_MODELS = ['Student', 'Subject', 'LeadTag', 'Channel', 'PointsReason']

const create = [
  body('model').isIn(ALLOWED_MODELS).withMessage('model 不合法'),
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('名称 1-50 字'),
  body('parentCategory').optional({ nullable: true }).isMongoId(),
  body('code').optional().isString().isLength({ max: 50 }),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean(),
  // 积分原因 (2026-06-21): meta.defaultValue + meta.direction
  body('meta').optional().isObject().withMessage('meta 必须是对象'),
  body('meta.defaultValue')
    .optional()
    .custom((v) => {
      if (!Number.isFinite(Number(v))) throw new Error('defaultValue 必须是数字')
      return true
    }),
  body('meta.direction').optional().isIn(['in', 'out']).withMessage('direction 必须是 in 或 out')
]

const update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('parentCategory').optional({ nullable: true }).isMongoId(),
  body('code').optional().isString().isLength({ max: 50 }),
  body('sort').optional().isInt(),
  body('isActive').optional().isBoolean(),
  body('meta').optional().isObject(),
  body('meta.defaultValue')
    .optional()
    .custom((v) => {
      if (!Number.isFinite(Number(v))) throw new Error('defaultValue 必须是数字')
      return true
    }),
  body('meta.direction').optional().isIn(['in', 'out'])
]

const idParam = [param('id').isMongoId()]

module.exports = { create, update, idParam, ALLOWED_MODELS }
