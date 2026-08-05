'use strict'

const { body } = require('express-validator')
const { ORDER_STATUSES, PAYMENT_METHODS } = require('@shared/enums')

/**
 * 创建订单 items 数组校验：
 *  - 数组非空
 *  - 每项包含 courseProduct (MongoId) 与 quantity (>= 1)
 *  - 不再接受单 courseProduct 字段（已重构为 items 数组）
 *
 * 2026-08-05: 0 元支付白拿课包堵口 (审计 S2)
 *   之前 paidAmount 仅 min:0, 与 actualPrice 无关 → 线下收款场景 paidAmount=0 也放行 → 0 元购课.
 *   现在 custom 校验: 若传了 paidAmount, 必须 >= actualPrice (浮点容差 1e-6).
 *   actualPrice 缺省 = originalPrice (服务端重算), 客户端可以传更小, 但必须 ≥ 0 且 ≤ originalPrice.
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
    // S2 堵口: 线下收款 (paidAmount 存在) 时, paidAmount 必须 >= actualPrice (容差 1e-6)
    // 注意: actualPrice 可能未传 (即用 originalPrice), 此处只校验"传了 paidAmount 必须 >= 传了 actualPrice".
    // 若 actualPrice 未传, 假定等于 originalPrice, validator 拿到的是 body, 看不出来 — 留给 service 用重算后的 finalActualPrice 校验.
    const EPS = 1e-6
    if (v.paidAmount != null && v.actualPrice != null && Number(v.paidAmount) < Number(v.actualPrice) - EPS) {
      throw new Error(`paidAmount(${v.paidAmount}) 不可低于 actualPrice(${v.actualPrice})`)
    }
    return true
  }),
  body('remark').optional().isString().isLength({ max: 500 })
]

const pay = [
  body('paymentMethod').isIn(PAYMENT_METHODS),
  body('paidAmount').isFloat({ min: 0 }),
  // S2 堵口 (validator 层): paidAmount 必须为正 — service 层还会再用 order.actualPrice 做精确校验,
  // 此处保证基本非负 (与 create 路径语义一致).
  body('paidAmount').custom((v) => {
    if (Number(v) <= 0) {
      throw new Error('paidAmount 必须 > 0')
    }
    return true
  })
]

const cancel = [
  body('reason').optional().isString().isLength({ max: 200 })
]

/**
 * 退款 (R-1722 2026-06-25 立项)：
 *   - amount：本次退款金额 > 0；service 内再做 ≤ (paidAmount - refundedAmount) 二次校验
 *   - reason：必填 1-500 字（财务凭证 + 家长沟通追溯）
 *   - 部分退款支持：累计到 refundedAmount == paidAmount 自动转 refunded
 */
const refund = [
  body('amount').isFloat({ min: 0.01 }).withMessage('退款金额必须 > 0'),
  body('reason').isString().trim().isLength({ min: 1, max: 500 }).withMessage('退款原因必填, 1-500 字')
]

module.exports = { create, pay, cancel, refund, ORDER_STATUSES }
