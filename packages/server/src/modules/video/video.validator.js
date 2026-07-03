'use strict'

const { param, query, body } = require('express-validator')

// express-validator v7 内置 isMongoId(), 不再需要 v6 时代的 'express-validator/lib/util/mongodb' 旁路
const idParam = [param('id').isMongoId().withMessage('id 非法')]

const list = [
  query('category').optional().isString().isLength({ max: 50 }),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 50 })
]

const adminList = [
  query('isPublished').optional().isIn(['true', 'false']),
  query('category').optional().isString().isLength({ max: 50 }),
  query('keyword').optional().isString().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 })
]

const create = [
  body('title').isString().trim().isLength({ min: 1, max: 80 }).withMessage('标题必填 1-80 字'),
  body('intro').optional().isString().isLength({ max: 200 }),
  body('videoUrl').isString().trim().isURL({ require_protocol: true }).withMessage('videoUrl 必填且为 https://'),
  body('coverFile').optional({ values: 'falsy' }).isMongoId().withMessage('coverFile 非法'),
  body('coverUrl').optional().isString().isLength({ max: 500 }),
  body('category').optional().isString().isLength({ max: 50 }),
  body('tags').optional().isArray(),
  body('durationSeconds').optional().isInt({ min: 0, max: 86400 }),
  body('isPublished').optional().isBoolean()
]

const update = [
  body('title').optional().isString().trim().isLength({ min: 1, max: 80 }),
  body('intro').optional().isString().isLength({ max: 200 }),
  body('videoUrl').optional().isString().trim().isURL({ require_protocol: true }),
  body('coverFile').optional({ values: 'falsy' }).isMongoId(),
  body('coverUrl').optional().isString().isLength({ max: 500 }),
  body('category').optional().isString().isLength({ max: 50 }),
  body('tags').optional().isArray(),
  body('durationSeconds').optional().isInt({ min: 0, max: 86400 }),
  body('isPublished').optional().isBoolean()
]

module.exports = { idParam, list, adminList, create, update }
