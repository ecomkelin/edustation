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
// 用户详情页聚合 (2026-08-07). 多段路径, 与单段通配 /:id 不冲突, 位置无所谓.
// 可见性由 userOverview.service.resolveScope 统一守门 (非超管必须 UserOrgRel 归属, 否则 404).
// R-0217 GET /users/:id/overview
router.get('/:id/overview', mws.requirePermission('user.read'), asyncHandler(c.overview))
// R-0218 GET /users/:id/related/:domain
router.get('/:id/related/:domain', mws.requirePermission('user.read'), asyncHandler(c.related))
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
// 2026-06 加 R-0213 PUT /users/:id/teacher-flag — 切换员工作为"对外名师"
// 走 user.write 权限 (教务/管理员即可); service 兜底拦截 roleScope='guardian'
router.put('/:id/teacher-flag', mws.requirePermission('user.write'), v.setTeacherFlag, mws.validateRequest, asyncHandler(c.setTeacherFlag))
// R-0214 POST /users/:id/org
router.post('/:id/org', mws.requirePermission('user.write'), v.attachToOrg, mws.validateRequest, asyncHandler(c.attachToOrg))

module.exports = router
