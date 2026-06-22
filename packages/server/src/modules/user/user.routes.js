'use strict'

const router = require('express').Router()
const c = require('./user.controller')
const v = require('./user.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-0200 GET /users
router.get('/', mws.requirePermission('user.read'), asyncHandler(c.list))
// R-0206 GET /users/lookup
router.get('/lookup', mws.requirePermission('user.read'), asyncHandler(c.lookupByMobile))
// 游离用户 (2026-06): 不在任何 UserOrgRel 的孤儿账号管理, 仅平台超管
// 路由注册顺序: 必须在 GET/PUT /:id 之前, 防 Express 通配优先级坑
// R-0207 GET /users/unaffiliated
router.get('/unaffiliated', mws.requirePlatformAdmin, asyncHandler(c.listUnaffiliated))
// R-0208 PUT /users/unaffiliated/:id
router.put('/unaffiliated/:id', mws.requirePlatformAdmin, v.updateUnaffiliated, mws.validateRequest, asyncHandler(c.updateUnaffiliated))
// R-0209 POST /users/unaffiliated/:id/reset-password
router.post('/unaffiliated/:id/reset-password', mws.requirePlatformAdmin, v.resetPassword, mws.validateRequest, asyncHandler(c.resetPasswordUnaffiliated))
// R-0201 GET /users/:id
router.get('/:id', mws.requirePermission('user.read'), asyncHandler(c.detail))
// R-0202 POST /users
router.post('/', mws.requirePermission('user.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-0203 PUT /users/:id
router.put('/:id', mws.requirePermission('user.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// R-0204 DELETE /users/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// R-0205 GET /users/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('user.read'), asyncHandler(c.removableCheck))
// R-0216 POST /users/:id/change-password
router.post('/:id/change-password', v.changePassword, mws.validateRequest, asyncHandler(c.changePassword))
// R-0215 POST /users/:id/reset-password
router.post('/:id/reset-password', mws.requirePermission('user.resetPassword'), v.resetPassword, mws.validateRequest, asyncHandler(c.resetPassword))
// 黑名单: 仅超管可操作（不叠加 user.write,避免教务误触）
// R-0210 PUT /users/:id/block
router.put('/:id/block', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
// R-0211 PUT /users/:id/unblock
router.put('/:id/unblock', mws.requirePlatformAdmin, v.setBlocked, mws.validateRequest, asyncHandler(c.setBlocked))
// R-0212 PUT /users/:id/positions
router.put('/:id/positions', mws.requirePermission('user.write'), v.setPositions, mws.validateRequest, asyncHandler(c.setPositions))
// R-0213 POST /users/:id/org
router.post('/:id/org', mws.requirePermission('user.write'), v.attachToOrg, mws.validateRequest, asyncHandler(c.attachToOrg))

module.exports = router
