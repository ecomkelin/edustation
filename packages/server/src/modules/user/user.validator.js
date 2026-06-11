'use strict'

const { body } = require('express-validator')

const create = [
  body('mobile').isString().trim().isLength({ min: 11, max: 11 }).withMessage('手机号格式错误'),
  body('password').optional().isString().isLength({ min: 6, max: 64 }),
  body('realName').optional().isString().isLength({ max: 50 }),
  body('avatar').optional().isString().isLength({ max: 500 }),
  body('idCard').optional({ values: 'falsy' }).isString().matches(/^\d{15}(\d{2}[\dXx])?$/).withMessage('身份证号格式不正确'),
  body('region').optional({ values: 'falsy' }).isMongoId().withMessage('地区 id 格式错误'),
  body('positions').optional().isArray(),
  body('positions.*').optional().isMongoId(),
  body('isMain').optional().isBoolean()
]

const update = [
  body('realName').optional().isString().isLength({ max: 50 }),
  body('avatar').optional().isString().isLength({ max: 500 }),
  body('idCard').optional({ values: 'falsy' }).isString().matches(/^\d{15}(\d{2}[\dXx])?$/).withMessage('身份证号格式不正确'),
  body('region').optional({ values: 'falsy' }).isMongoId().withMessage('地区 id 格式错误'),
  body('isActive').optional().isBoolean()
]

const changePassword = [
  body('oldPassword').isString().notEmpty().withMessage('原密码必填'),
  body('newPassword').isString().isLength({ min: 6, max: 64 }).withMessage('新密码 6-64 位')
]

const resetPassword = [
  body('newPassword').isString().isLength({ min: 6, max: 64 }).withMessage('新密码 6-64 位')
]

const setPositions = [
  body('positions').isArray({ min: 0 }).withMessage('positions 必须是数组'),
  body('positions.*').isMongoId()
]

const attachToOrg = [
  body('positions').optional().isArray(),
  body('positions.*').optional().isMongoId(),
  body('isMain').optional().isBoolean()
]

const setBlocked = [
  body('isBlocked').optional().isBoolean(),
  body('reason').optional().isString().isLength({ max: 500 })
]

module.exports = { create, update, changePassword, resetPassword, setPositions, attachToOrg, setBlocked }
