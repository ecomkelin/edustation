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
  body('title').isString().trim().isLength({ min: 1, max: 100 }).withMessage('标题必填 1-100 字'),
  body('summary').optional().isString().isLength({ max: 200 }),
  body('contentMarkdown').isString().withMessage('正文必填'),
  // coverFile 是 ObjectId 字符串; 用 isMongoId() 验
  body('coverFile').optional({ values: 'falsy' }).isMongoId().withMessage('coverFile 非法'),
  body('category').optional().isString().isLength({ max: 50 }),
  body('isPublished').optional().isBoolean()
]

const update = [
  body('title').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('summary').optional().isString().isLength({ max: 200 }),
  body('contentMarkdown').optional().isString(),
  body('coverFile').optional({ values: 'falsy' }).isMongoId(),
  body('category').optional().isString().isLength({ max: 50 }),
  body('isPublished').optional().isBoolean()
]

module.exports = { idParam, list, adminList, create, update }
