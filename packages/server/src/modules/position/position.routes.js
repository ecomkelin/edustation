'use strict'

const router = require('express').Router()
const c = require('./position.controller')
const v = require('./position.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ApiError = require('@utils/ApiError')

/* ------------------------------------------------------------------
 * 1) 平台超管专属：跨机构同步相关
 *    - 仅平台超管可调用
 *    - 仍然挂 `requireOrg`：对超管来说，x-org-id 是可选的（不传则 req.orgId=null），
 *      传了就校验存在并写入 req.orgId。GET 类接口不依赖 req.orgId；POST /sync
 *      在 service 层强制要求 req.orgId 非空（对应"请先在顶部选择机构"）。
 *    - 关键: isPlatformAdmin 守卫**必须挂在每个路由前**, 不能用 platformRouter.use(...);
 *      否则 router.use(platformRouter) 会让 platformRouter 接管**所有**路径, 本机构查询
 *      也会被 403 (2026-06 修过这个坑).
 * ------------------------------------------------------------------ */
const platformRouter = require('express').Router()
platformRouter.use(mws.authenticate)
const platformAdminOnly = (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized())
  if (!req.user.isPlatformAdmin) return next(ApiError.forbidden('仅平台超管可执行跨机构同步'))
  next()
}
platformRouter.use(mws.requireOrg)
// R-0307 GET /positions/source-orgs
platformRouter.get('/source-orgs', platformAdminOnly, asyncHandler(c.listSourceOrgs))
// R-0308 GET /positions/by-org/:orgId
platformRouter.get('/by-org/:orgId', platformAdminOnly, asyncHandler(c.listByOrg))
// R-0309 POST /positions/sync
platformRouter.post('/sync', platformAdminOnly, v.sync, mws.validateRequest, asyncHandler(c.sync))
router.use(platformRouter)

/* ------------------------------------------------------------------
 * 2) 本机构职位管理（保留原行为）
 * ------------------------------------------------------------------ */
router.use(mws.authenticate, mws.requireOrg)

// R-0306 GET /positions/permissions-catalog
router.get('/permissions-catalog', mws.requirePermission('position.write'), asyncHandler(c.permissionsCatalog))
// R-0300 GET /positions
router.get('/', mws.requirePermission('position.read'), asyncHandler(c.list))
// R-0301 GET /positions/:id
router.get('/:id', mws.requirePermission('position.read'), asyncHandler(c.detail))
// R-0305 GET /positions/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('position.read'), asyncHandler(c.removableCheck))
// R-0302 POST /positions
router.post('/', mws.requirePermission('position.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-0303 PUT /positions/:id
router.put('/:id', mws.requirePermission('position.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):超管+密码二次确认;系统职位不可删(service 校验);
  // 业务上要求无员工持有(service 校验 UserOrgRel.positions)。
// R-0304 DELETE /positions/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// R-0312 PUT /positions/:id/permissions
router.put('/:id/permissions', mws.requirePermission('position.write'), v.setPermissions, mws.validateRequest, asyncHandler(c.setPermissions))

module.exports = router
