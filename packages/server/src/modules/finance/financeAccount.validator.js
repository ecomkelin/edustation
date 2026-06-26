'use strict'

const { body, param, query } = require('express-validator')
const { FINANCE_ACCOUNT_TYPES } = require('@shared/enums')

const idParam = [
  param('id').isMongoId().withMessage('id 必须是合法的 ObjectId')
]

const listAccounts = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('type').optional().isIn(FINANCE_ACCOUNT_TYPES).withMessage('type 不合法'),
  query('isActive').optional().isIn(['true', 'false']).withMessage('isActive 必须是 true/false'),
  query('search').optional().isString().isLength({ max: 50 })
]

const create = [
  body('name').isString().trim().isLength({ min: 1, max: 50 }).withMessage('name 1-50 字'),
  body('type').isIn(FINANCE_ACCOUNT_TYPES).withMessage('type 必须是 bank/wechat/alipay/cash/other'),
  body('bankName').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('accountHolder').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('accountNumberLast4').optional({ values: 'falsy' })
    .matches(/^\d{4}$/).withMessage('accountNumberLast4 必须是 4 位数字'),
  body('branch').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('wechatId').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('alipayId').optional({ values: 'falsy' }).isString().isLength({ max: 80 }),
  body('location').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('remark').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
  body('isActive').optional().isBoolean(),
  body('isPrimary').optional().isBoolean()
]

const update = [
  param('id').isMongoId(),
  body('name').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('bankName').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('accountHolder').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('accountNumberLast4').optional({ values: 'falsy' })
    .matches(/^\d{4}$/).withMessage('accountNumberLast4 必须是 4 位数字'),
  body('branch').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('wechatId').optional({ values: 'falsy' }).isString().isLength({ max: 50 }),
  body('alipayId').optional({ values: 'falsy' }).isString().isLength({ max: 80 }),
  body('location').optional({ values: 'falsy' }).isString().isLength({ max: 100 }),
  body('remark').optional({ values: 'falsy' }).isString().isLength({ max: 500 }),
  body('isActive').optional().isBoolean()
]

module.exports = { idParam, listAccounts, create, update }
