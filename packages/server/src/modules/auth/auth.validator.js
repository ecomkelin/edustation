'use strict'

const { body } = require('express-validator')
const { USER_AVATAR_KEYS } = require('@shared/avatars')

exports.loginVD = [
  body('mobile').isString().trim().notEmpty().withMessage('手机号必填').bail().isLength({ min: 11, max: 11 }).withMessage('手机号格式错误'),
  body('password').isString().notEmpty().withMessage('密码必填').bail().isLength({ min: 6, max: 64 }).withMessage('密码长度 6-64')
]

// 自助修改密码：原密码 + 新密码（与 user.changePassword 等价，但用 req.user.id 锁死目标）
exports.changePasswordVD = [
  body('oldPassword').isString().notEmpty().withMessage('原密码必填'),
  body('newPassword').isString().isLength({ min: 6, max: 64 }).withMessage('新密码长度 6-64')
]

// 自助修改资料：所有字段可选；后端再去显式拿白名单字段（避免误改 isPlatformAdmin / mobile / passwordHash）
exports.updateMeVD = [
  body('realName').optional({ values: 'falsy' }).isString().isLength({ max: 50 }).withMessage('姓名最长 50'),
  body('avatarSvgKey').optional({ values: 'falsy' }).isString().isIn(USER_AVATAR_KEYS).withMessage(`头像必须是 ${USER_AVATAR_KEYS.join('/')} 之一`),
  body('idCard').optional({ values: 'falsy' }).isString().matches(/^\d{15}(\d{2}[\dXx])?$/).withMessage('身份证号格式不正确'),
  body('region').optional({ values: 'falsy' }).isMongoId().withMessage('地区 id 格式错误')
]

// ─── 微信小程序登录 (2026-08) ───
// R-0106 wx-login: wx.login 的 code
exports.wxLoginVD = [
  body('code').isString().notEmpty().withMessage('微信 code 必填')
]

// R-0107 wx-bind: loginCode (wx.login) + phoneCode (getPhoneNumber) + 可选 scene
exports.wxBindVD = [
  body('loginCode').isString().notEmpty().withMessage('微信 loginCode 必填'),
  body('phoneCode').isString().notEmpty().withMessage('微信 phoneCode 必填'),
  body('scene').optional({ values: 'falsy' }).isString().withMessage('scene 格式错误')
]

// R-0108 wx-refresh: 小程序专用, refreshToken 走 body
exports.wxRefreshVD = [
  body('refreshToken').isString().notEmpty().withMessage('refreshToken 必填')
]
