'use strict'

const router = require('express').Router()
const c = require('./subject.controller')
const v = require('./subject.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')

/* ------------------------------------------------------------------
 * 1) 平台超管专属：跨机构同步相关
 *    与 position 同步保持一致：仅平台超管可调用，service 层强制 targetOrgId 非空。
 * ------------------------------------------------------------------ */
const platformRouter = require('express').Router()
platformRouter.use(mws.authenticate)
platformRouter.use(mws.requireOrg)
platformRouter.use((req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!req.user.isPlatformAdmin) return next(ApiError.forbidden('仅平台超管可执行跨机构同步'))
  next()
})
platformRouter.get('/source-orgs', asyncHandler(c.listSourceOrgs))
platformRouter.get('/by-org/:orgId', asyncHandler(c.listByOrg))
platformRouter.post('/sync', v.sync, mws.validateRequest, asyncHandler(c.sync))
router.use(platformRouter)

/* ------------------------------------------------------------------
 * 2) 本机构学科管理（保留原行为）
 * ------------------------------------------------------------------ */
router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('subject.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('subject.read'), asyncHandler(c.detail))
router.get('/:id/removable-check', mws.requirePermission('subject.read'), asyncHandler(c.removableCheck))
router.post('/', mws.requirePermission('subject.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('subject.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):超管+密码二次确认 + 业务上无 CourseProduct/CourseInstance 引用
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
