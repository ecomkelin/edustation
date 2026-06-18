'use strict'

const { body, param } = require('express-validator')
const { ORG_TYPES } = require('@shared/enums')

// 2026-06: Org.type 从 ObjectId(Category) 改成 String enum,
// 校验用 isIn(ORG_TYPES) 而不是 isMongoId.
const create = [
  body('unicode').isString().trim().isLength({ min: 1, max: 64 }).withMessage('内部编码 1-64 字'),
  body('socialCreditCode').optional().isString().trim().isLength({ max: 64 }).withMessage('社会信用代码 ≤ 64 字'),
  body('legalPerson').optional().isString().trim().isLength({ max: 50 }).withMessage('法人代表 ≤ 50 字'),
  body('licenseNumber').optional().isString().trim().isLength({ max: 64 }).withMessage('办学许可证号 ≤ 64 字'),
  body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('机构全称 1-100 字'),
  body('nameAbbreviation').isString().trim().isLength({ min: 1, max: 50 }).withMessage('机构简称 1-50 字'),
  body('type').optional({ nullable: true }).isIn(ORG_TYPES).withMessage(`机构业态不合法, 必须是: ${ORG_TYPES.join('/')}`),
  body('region').optional({ nullable: true }).isMongoId().withMessage('地区不合法'),
  body('principal').optional({ nullable: true }).isMongoId().withMessage('负责人不合法'),
  body('contactPerson').optional().isString().isLength({ max: 50 }),
  body('contactPhone').optional().isString().isLength({ max: 50 }),
  body('address').optional().isString().isLength({ max: 200 }),
  body('establishedDate').optional({ nullable: true }).isISO8601().withMessage('开设时间格式不合法')
]

const update = [
  // super-admin-only 字段 (service 层硬卡, 校验只做形状)
  body('unicode').optional().isString().trim().isLength({ min: 1, max: 64 }),
  body('socialCreditCode').optional().isString().trim().isLength({ max: 64 }),
  body('legalPerson').optional().isString().trim().isLength({ max: 50 }),
  body('licenseNumber').optional().isString().trim().isLength({ max: 64 }),
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('nameAbbreviation').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('type').optional({ nullable: true }).isIn(ORG_TYPES).withMessage(`机构业态不合法`),
  body('region').optional({ nullable: true }).isMongoId(),
  body('principal').optional({ nullable: true }).isMongoId(),
  body('establishedDate').optional({ nullable: true }).isISO8601().withMessage('开设时间格式不合法'),
  // shared 字段 (平台超管 + 机构 admin 均可写)
  body('contactPerson').optional().isString().isLength({ max: 50 }),
  body('contactPhone').optional().isString().isLength({ max: 50 }),
  body('address').optional().isString().isLength({ max: 200 }),
  body('isActive').optional().isBoolean()
]

const idParam = [param('id').isMongoId()]

const toggleActive = [
  body('password').isString().isLength({ min: 6, max: 64 }).withMessage('请输入 6-64 位密码')
]

module.exports = { create, update, idParam, toggleActive }
