'use strict'

const { body } = require('express-validator')

/**
 * 课程产品的学科字段: `subjects`（数组、可空、可多）。
 *  - 都未传：允许（产品可以不挂学科）
 */
const subjectsChain = (location) => body(location)
  .optional()
  .custom((val) => {
    const arr = Array.isArray(val) ? val : [val]
    if (!arr.every((v) => typeof v === 'string' && /^[a-f0-9]{24}$/i.test(v))) {
      throw new Error('subjects 含非法 id')
    }
    return true
  })

/**
 * 课程产品三档价格校验：
 *  - originalPrice（原价）：必填，>= 0
 *  - discountPrice（折扣价）：必填，>= 0
 *  - promotionPrice（活动价）：可选（默认 0），>= 0
 *  - promotionActive：可选（默认 false）
 *  - 单调性校验由 service 层在写入前做（originalPrice > discountPrice > promotionPrice 当启用活动）
 */
const create = [
  subjectsChain('subjects'),
  body('name').isString().trim().isLength({ min: 1, max: 100 }),
  body('totalLessons').isInt({ min: 1 }),
  body('minutesPerLesson').optional().isInt({ min: 1 }),
  body('originalPrice').isFloat({ min: 0 }),
  body('discountPrice').optional().isFloat({ min: 0 }),
  body('promotionPrice').optional().isFloat({ min: 0 }),
  body('promotionActive').optional().isBoolean(),
  body('validDays').isInt({ min: 1 }),
  // syllabus 已剥离到 Subject 上；CourseProduct 不再接收
  body('isActive').optional().isBoolean()
]

const update = [
  subjectsChain('subjects'),
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('totalLessons').optional().isInt({ min: 1 }),
  body('minutesPerLesson').optional().isInt({ min: 1 }),
  body('originalPrice').optional().isFloat({ min: 0 }),
  body('discountPrice').optional().isFloat({ min: 0 }),
  body('promotionPrice').optional().isFloat({ min: 0 }),
  body('promotionActive').optional().isBoolean(),
  body('validDays').optional().isInt({ min: 1 }),
  // syllabus 已剥离到 Subject 上；CourseProduct 不再接收
  body('isActive').optional().isBoolean()
]

const sync = [
  body('sourceOrgId').isMongoId().withMessage('源机构 id 不合法'),
  body('productIds').isArray({ min: 1, max: 200 }).withMessage('productIds 必填，1-200 个'),
  body('productIds.*').isMongoId().withMessage('productIds 含非法 id')
]

module.exports = { create, update, sync }
