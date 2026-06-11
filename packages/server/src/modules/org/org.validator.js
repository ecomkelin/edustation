'use strict'

const { body, param } = require('express-validator')

const create = [
  body('unicode').isString().trim().isLength({ min: 1, max: 64 }).withMessage('社会信用代码 1-64 字'),
  body('name').isString().trim().isLength({ min: 1, max: 100 }).withMessage('机构全称 1-100 字'),
  body('nameAbbreviation').isString().trim().isLength({ min: 1, max: 50 }).withMessage('机构简称 1-50 字'),
  body('type').optional({ nullable: true }).isMongoId().withMessage('类型不合法'),
  body('region').optional({ nullable: true }).isMongoId().withMessage('地区不合法'),
  body('principal').optional({ nullable: true }).isMongoId().withMessage('负责人不合法'),
  body('contactPerson').optional().isString().isLength({ max: 50 }),
  body('contactPhone').optional().isString().isLength({ max: 50 }),
  body('address').optional().isString().isLength({ max: 200 }),
  body('establishedDate').optional({ nullable: true }).isISO8601().withMessage('开设时间格式不合法')
]

const update = [
  body('unicode').optional().isString().trim().isLength({ min: 1, max: 64 }),
  body('name').optional().isString().trim().isLength({ min: 1, max: 100 }),
  body('nameAbbreviation').optional().isString().trim().isLength({ min: 1, max: 50 }),
  body('type').optional({ nullable: true }).isMongoId(),
  body('region').optional({ nullable: true }).isMongoId(),
  body('principal').optional({ nullable: true }).isMongoId(),
  body('contactPerson').optional().isString().isLength({ max: 50 }),
  body('contactPhone').optional().isString().isLength({ max: 50 }),
  body('address').optional().isString().isLength({ max: 200 }),
  body('isActive').optional().isBoolean()
  // establishedDate 不允许修改：不接受此字段
]

const idParam = [param('id').isMongoId()]

const toggleActive = [
  body('password').isString().isLength({ min: 6, max: 64 }).withMessage('请输入 6-64 位密码')
]

module.exports = { create, update, idParam, toggleActive }
