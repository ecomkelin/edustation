'use strict'

const { body } = require('express-validator')
const { ORDER_STATUSES, PAYMENT_METHODS } = require('@shared/enums')

/**
 * 创建订单 items 数组校验：
 *  - 数组非空
 *  - 每项包含 courseProduct (MongoId) 与 quantity (>= 1)
 *  - 不再接受单 courseProduct 字段（已重构为 items 数组）
 */
const create = [
  body('student').isMongoId(),
  body('items').isArray({ min: 1 }).withMessage('items 至少包含 1 个课程产品'),
  body('items.*.courseProduct').isMongoId().withMessage('items[].courseProduct 必须是 MongoId'),
  body('items.*.quantity').optional().isInt({ min: 1 }).withMessage('items[].quantity 必须 >= 1'),
  body('actualPrice').optional().isFloat({ min: 0 }),
  body('paymentMethod').optional().isIn(PAYMENT_METHODS),
  // 「员工线下收款」一气呵成场景：传 paymentMethod + paidAmount 即视为已收款订单，
  // 后端原子地标 paid 并按 items 逐项创建 StudentProduct。
  body('paidAmount').optional().isFloat({ min: 0 }).withMessage('paidAmount 必须 >= 0'),
  body().custom((v) => {
    // 两个字段必须同时出现或同时缺省，避免「标记了支付方式但未收款」这种半成品状态
    if ((v.paymentMethod == null) !== (v.paidAmount == null)) {
      throw new Error('paymentMethod 与 paidAmount 必须同时传入（线下收款订单）或不传（待支付订单）')
    }
    return true
  }),
  body('remark').optional().isString().isLength({ max: 500 })
]

const pay = [
  body('paymentMethod').isIn(PAYMENT_METHODS),
  body('paidAmount').isFloat({ min: 0 })
]

const cancel = [
  body('reason').optional().isString().isLength({ max: 200 })
]

module.exports = { create, pay, cancel, ORDER_STATUSES }
