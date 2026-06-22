'use strict'

const router = require('express').Router()
const c = require('./auth.controller')
const v = require('./auth.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

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

module.exports = router
