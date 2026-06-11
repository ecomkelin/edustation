'use strict'

const { body } = require('express-validator')

/**
 * 赠课请求体校验（POST /api/v1/student-products/gift）
 *  - student: 学生 id（必填）
 *  - courseProduct: 课程产品 id（必填）
 *  - giftReason: 赠课原因（必填，写明原因便于审计）
 *  - totalLessons / expireDate: 可选（不传时按 CourseProduct 默认）
 */
const gift = [
  body('student').isMongoId().withMessage('student 必填'),
  body('courseProduct').isMongoId().withMessage('courseProduct 必填'),
  body('giftReason').isString().trim().isLength({ min: 1, max: 500 }).withMessage('giftReason 必填（最长 500 字）'),
  body('totalLessons').optional().isInt({ min: 1 }),
  body('expireDate').optional().isISO8601()
]

module.exports = { gift }
