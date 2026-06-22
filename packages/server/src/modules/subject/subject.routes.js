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
// 关键: isPlatformAdmin 检查**必须挂在每个具体路由前**, 而不能用 platformRouter.use(...) 当中间件!
// 因为 router.use(platformRouter) 会让 platformRouter 接管**所有**路径 (含 GET /, GET /:id),
//   若把 isPlatformAdmin 挂在 platformRouter.use 上, 就会让本机构查询也被 403.
// 正确做法: 平台路由层只挂 authenticate + requireOrg (顺序对超管友好), 在每个 .get/.post 上
//   显式 requirePlatformAdmin 守卫.
const platformAdminOnly = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!req.user.isPlatformAdmin) return next(ApiError.forbidden('仅平台超管可执行跨机构同步'))
  next()
}
platformRouter.use(mws.requireOrg)
// R-0507 GET /subjects/source-orgs
platformRouter.get('/source-orgs', platformAdminOnly, asyncHandler(c.listSourceOrgs))
// R-0508 GET /subjects/by-org/:orgId
platformRouter.get('/by-org/:orgId', platformAdminOnly, asyncHandler(c.listByOrg))
// R-0509 POST /subjects/sync
platformRouter.post('/sync', platformAdminOnly, v.sync, mws.validateRequest, asyncHandler(c.sync))
router.use(platformRouter)

/* ------------------------------------------------------------------
 * 2) 本机构学科管理（保留原行为）
 * ------------------------------------------------------------------ */
router.use(mws.authenticate, mws.requireOrg)

// R-0500 GET /subjects
router.get('/', mws.requirePermission('subject.read'), asyncHandler(c.list))
// R-0501 GET /subjects/:id
router.get('/:id', mws.requirePermission('subject.read'), asyncHandler(c.detail))
// R-0505 GET /subjects/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('subject.read'), asyncHandler(c.removableCheck))
// R-0502 POST /subjects
router.post('/', mws.requirePermission('subject.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-0503 PUT /subjects/:id
router.put('/:id', mws.requirePermission('subject.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):超管+密码二次确认 + 业务上无 CourseProduct/CourseInstance 引用
// R-0504 DELETE /subjects/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
