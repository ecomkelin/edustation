'use strict'

/**
 * 机构推广信息 (OrgPromotion) 路由
 *
 * 路径: /api/v1/orgs/:orgId/promotion
 *
 * 设计:
 *   - 路径挂 /orgs 下 (与 Org 资源同源), 不另开 /promotions
 *   - 权限: org-promotion.read / org-promotion.write (挂在「管理员」「教务」系统职位)
 *   - 跨租户校验: service.update 内部校验 org 存在; fileBind 走 bindOrgId 校验
 *   - 平台超管也可访问 (用 manage 语义看 / 改任意机构推广)
 *
 * 注意: 这个文件**不**挂到 routers/index.js, 而是**合并到 org.routes.js** (orgPromoRouter)
 * 以便复用 /orgs/:id 路径前缀。详见 org.routes.js 注释。
 */

const router = require('express').Router({ mergeParams: true })
const c = require('./orgPromotion.controller')
const v = require('./orgPromotion.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-0930 GET /orgs/:id/promotion
router.get(
  '/',
  mws.requirePermission('org-promotion.read'),
  v.orgIdParam,
  mws.validateRequest,
  asyncHandler(c.get)
)

// R-0931 PUT /orgs/:id/promotion
router.put(
  '/',
  mws.requirePermission('org-promotion.write'),
  v.orgIdParam,
  v.update,
  mws.validateRequest,
  asyncHandler(c.update)
)

module.exports = router
