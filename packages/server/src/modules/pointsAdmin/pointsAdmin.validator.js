'use strict'

/**
 * 积分管理（admin 端）express-validator
 */

const { body, param, query } = require('express-validator')

const studentIdParam = [
  param('studentId').isMongoId().withMessage('studentId 必须是合法的 ObjectId')
]

const adjust = [
  body('amount').custom((v) => {
    // 允许字符串或数字；非 0 整数
    const n = Number(v)
    if (!Number.isFinite(n) || n === 0 || !Number.isInteger(n)) {
      throw new Error('amount 必须是非 0 整数')
    }
    return true
  }),
  body('reasonId').isMongoId().withMessage('reasonId 必须是合法的 ObjectId'),
  body('customReason').optional().isString().isLength({ max: 200 }).withMessage('自定义备注最多 200 字'),
  body('remark').optional().isString().isLength({ max: 500 }).withMessage('备注最多 500 字')
]

const listAccounts = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('keyword').optional().isString().isLength({ max: 50 }),
  query('sortBy').optional().isIn(['balance-desc', 'recent', 'name']).withMessage('sortBy 不合法')
]

const listTransactions = [
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('pageSize').optional().isInt({ min: 1, max: 200 }).toInt(),
  query('studentId').optional().isMongoId(),
  query('trigger').optional().isString(), // CSV; service 层拆分
  query('from').optional().isISO8601().withMessage('from 必须是 ISO 日期'),
  query('to').optional().isISO8601().withMessage('to 必须是 ISO 日期')
]

module.exports = {
  studentIdParam,
  adjust,
  listAccounts,
  listTransactions
}
