'use strict'

const router = require('express').Router()
const c = require('./auth.controller')
const v = require('./auth.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.post('/login', v.loginVD, mws.validateRequest, asyncHandler(c.login))
router.post('/refresh', asyncHandler(c.refresh))
router.post('/logout', mws.authenticate, asyncHandler(c.logout))
router.get('/me', mws.authenticate, asyncHandler(c.me))

// 自助修改资料 / 自助修改密码 ——— 仅需 authenticate, 不挂任何 permission, 用 req.user.id 锁定目标
router.put('/me', mws.authenticate, v.updateMeVD, mws.validateRequest, asyncHandler(c.updateMe))
router.post('/change-password', mws.authenticate, v.changePasswordVD, mws.validateRequest, asyncHandler(c.changePassword))

module.exports = router
