'use strict'

const router = require('express').Router()
const c = require('./auth.controller')
const v = require('./auth.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 微信端点 per-IP 限流 (工厂调用一次, 三个端点共享; 详见 middlewares/ipRateLimit.js)
const ipRL = mws.ipRateLimit()

// R-0100 POST /auth/login
router.post('/login', v.loginVD, mws.validateRequest, mws.loginRateLimit, asyncHandler(c.login))
// R-0101 POST /auth/refresh
router.post('/refresh', asyncHandler(c.refresh))
// R-0102 POST /auth/logout
router.post('/logout', mws.authenticate, asyncHandler(c.logout))
// R-0103 GET /auth/me
router.get('/me', mws.authenticate, asyncHandler(c.me))

// 自助修改资料 / 自助修改密码 ——— 仅需 authenticate, 不挂任何 permission, 用 req.user.id 锁定目标
// R-0104 PUT /auth/me
router.put('/me', mws.authenticate, v.updateMeVD, mws.validateRequest, asyncHandler(c.updateMe))
// R-0105 POST /auth/change-password
router.post('/change-password', mws.authenticate, v.changePasswordVD, mws.validateRequest, asyncHandler(c.changePassword))

// ─── 微信小程序登录 (2026-08) ─── 全部 OPEN + per-IP 限流, 不依赖 cookie
// R-0106 POST /auth/wx-login (老用户静默; 未绑定返 need_bind)
router.post('/wx-login', v.wxLoginVD, mws.validateRequest, ipRL, asyncHandler(c.wxLogin))
// R-0107 POST /auth/wx-bind (绑定已有账号 / scene 有效则自助注册; 否则返 need_org)
router.post('/wx-bind', v.wxBindVD, mws.validateRequest, ipRL, asyncHandler(c.wxBind))
// R-0108 POST /auth/wx-refresh (复用 service.refresh, body 读写, 不走 cookie)
router.post('/wx-refresh', v.wxRefreshVD, mws.validateRequest, ipRL, asyncHandler(c.wxRefresh))

module.exports = router
