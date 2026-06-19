'use strict'

const router = require('express').Router()
const c = require('./user.controller')
const v = require('./user.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('user.read'), asyncHandler(c.list))
router.get('/lookup', mws.requirePermission('user.read'), asyncHandler(c.lookupByMobile))
// 游离用户 (2026-06): 不在任何 UserOrgRel 的孤儿账号管理, 仅平台超管
// 路由注册顺序: 必须在 GET/PUT /:id 之前, 防 Express 通配优先级坑
router.get('/unaffiliated', mws.requirePlatformAdmin, asyncHandler(c.listUnaffiliated))
router.put('/unaffiliated/:id', mws.requirePlatformAdmin, v.updateUnaffiliated, mws.validateRequest, asyncHandler(c.updateUnaffiliated))
router.post('/unaffiliated/:id/reset-password', mws.requirePlatformAdmin, v.resetPassword, mws.validateRequest, asyncHandler(c.resetPasswordUnaffiliated))
router.get('/:id', mws.requirePermission('user.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('user.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('user.write'), v.update, mws.validateRequest, asyncHandler(c.update))
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
router.get('/:id/removable-check', mws.requirePermission('user.read'), asyncHandler(c.removableCheck))
router.post('/:id/change-password', v.changePassword, mws.validateRequest, asyncHandler(c.changePassword))
router.post('/:id/reset-password', mws.requirePermission('user.resetPassword'), v.resetPassword, mws.validateRequest, asyncHandler(c.resetPassword))
// 黑名单: 仅超管可操作（不叠加 user.write,避免教务误触）
router.put('/:id/block', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
router.put('/:id/unblock', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
router.put('/:id/positions', mws.requirePermission('user.write'), v.setPositions, mws.validateRequest, asyncHandler(c.setPositions))
router.post('/:id/org', mws.requirePermission('user.write'), v.attachToOrg, mws.validateRequest, asyncHandler(c.attachToOrg))

module.exports = router
