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
 * 2) 本机构职位管理（保留原行为）
 * ------------------------------------------------------------------ */
router.use(mws.authenticate, mws.requireOrg)

router.get('/permissions-catalog', mws.requirePermission('position.write'), asyncHandler(c.permissionsCatalog))
router.get('/', mws.requirePermission('position.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('position.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('position.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('position.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):超管+密码二次确认;系统职位不可删(service 校验);
  // 业务上要求无员工持有(service 校验 UserOrgRel.positions)。
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
router.put('/:id/permissions', mws.requirePermission('position.write'), v.setPermissions, mws.validateRequest, asyncHandler(c.setPermissions))

module.exports = router
