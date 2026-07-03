'use strict'

const { param, query, body } = require('express-validator')

// express-validator v7 内置 isMongoId() 替代 v6 旁路
const idParam = [param('id').isMongoId().withMessage('id 非法')]

const list = [
  query('tag').optional().isString().isLength({ max: 30 }),
  query('difficulty').optional().isIn(['easy', 'medium', 'hard', '']),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 50 })
]

const adminList = [
  query('isPublished').optional().isIn(['true', 'false']),
  query('keyword').optional().isString().isLength({ max: 100 }),
  query('page').optional().isInt({ min: 1 }),
  query('pageSize').optional().isInt({ min: 1, max: 100 })
]

const create = [
  body('name').isString().trim().isLength({ min: 1, max: 60 }).withMessage('名称必填 1-60 字'),
  body('intro').optional().isString().isLength({ max: 200 }),
  body('launchUrl').isString().trim().isURL({ require_protocol: true }).withMessage('launchUrl 必填且为 https://'),
  body('coverFile').optional({ values: 'falsy' }).isMongoId(),
  body('coverUrl').optional().isString().isLength({ max: 500 }),
  body('tags').optional().isArray(),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard', '']),
  body('isPublished').optional().isBoolean()
]

const update = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 60 }),
  body('intro').optional().isString().isLength({ max: 200 }),
  body('launchUrl').optional().isString().trim().isURL({ require_protocol: true }),
  body('coverFile').optional({ values: 'falsy' }).isMongoId(),
  body('coverUrl').optional().isString().isLength({ max: 500 }),
  body('tags').optional().isArray(),
  body('difficulty').optional().isIn(['easy', 'medium', 'hard', '']),
  body('isPublished').optional().isBoolean()
]

module.exports = { idParam, list, adminList, create, update }
