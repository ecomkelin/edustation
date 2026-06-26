'use strict'

const { body, param, query } = require('express-validator')
const { FINANCE_TRANSACTION_TYPES } = require('@shared/enums')

const idParam = [
  param('id').isMongoId().withMessage('id 必须是合法的 ObjectId')
]

const listTx = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('accountId').optional().isMongoId(),
  query('type').optional().isIn(FINANCE_TRANSACTION_TYPES),
  query('reason').optional().isMongoId(),
  query('relatedOrder').optional().isMongoId(),
  query('relatedStudent').optional().isMongoId(),
  query('dateFrom').optional().isISO8601().withMessage('dateFrom 必须是 ISO 日期'),
  query('dateTo').optional().isISO8601().withMessage('dateTo 必须是 ISO 日期')
]

const summaryQuery = [
  query('groupBy').optional().isIn(['reason', 'account', 'day', 'month']).withMessage('groupBy 不合法'),
  query('accountId').optional().isMongoId(),
  query('type').optional().isIn(FINANCE_TRANSACTION_TYPES),
  query('dateFrom').optional().isISO8601(),
  query('dateTo').optional().isISO8601()
]

const createTx = [
  // 必填: account / type / amount / reason
  body('account').isMongoId().withMessage('account 必须是 ObjectId (用户诉求: 账号必填)'),
  body('type').isIn(FINANCE_TRANSACTION_TYPES).withMessage('type 必须是 income/expense/transfer'),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount 必须 > 0'),
  body('reason').isMongoId().withMessage('reason 必填'),
  // 可选
  body('relatedOrder').optional({ values: 'falsy' }).isMongoId(),
  body('relatedStudent').optional({ values: 'falsy' }).isMongoId(),
  body('occurredAt').optional({ values: 'falsy' }).isISO8601().withMessage('occurredAt 必须是 ISO 日期'),
  body('remark').optional({ values: 'falsy' }).isString().isLength({ max: 500 })
]

const transfer = [
  body('fromAccount').isMongoId().withMessage('fromAccount 必填'),
  body('toAccount').isMongoId().withMessage('toAccount 必填'),
  body().custom((v) => {
    if (v.fromAccount && v.toAccount && String(v.fromAccount) === String(v.toAccount)) {
      throw new Error('转出与转入账本不能相同')
    }
    return true
  }),
  body('amount').isFloat({ min: 0.01 }).withMessage('amount 必须 > 0'),
  body('reason').isMongoId().withMessage('reason 必填 (建议选"内部转账")'),
  body('occurredAt').optional({ values: 'falsy' }).isISO8601(),
  body('remark').optional({ values: 'falsy' }).isString().isLength({ max: 500 })
]

module.exports = { idParam, listTx, summaryQuery, createTx, transfer }
