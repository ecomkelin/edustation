'use strict'

const { body } = require('express-validator')

exports.loginVD = [
  body('mobile').isString().trim().notEmpty().withMessage('手机号必填').bail().isLength({ min: 11, max: 11 }).withMessage('手机号格式错误'),
  body('password').isString().notEmpty().withMessage('密码必填').bail().isLength({ min: 6, max: 64 }).withMessage('密码长度 6-64')
]

exports.changePasswordVD = [
  body('oldPassword').isString().notEmpty().withMessage('原密码必填'),
  body('newPassword').isString().isLength({ min: 6, max: 64 }).withMessage('新密码长度 6-64')
]
