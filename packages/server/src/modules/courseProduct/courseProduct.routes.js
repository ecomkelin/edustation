'use strict'

const router = require('express').Router()
const c = require('./courseProduct.controller')
const v = require('./courseProduct.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

/* 跨机构同步（仅平台超管可见/可用）。
   注意：必须放在 /:id 之前，否则 :id 会先抢到 "_sync" 字面量导致 404。 */
// R-1007 GET /course-products/_sync/source-orgs
router.get('/_sync/source-orgs', mws.requirePlatformAdmin, asyncHandler(c.listSourceOrgs))
// R-1008 GET /course-products/_sync/by-org/:orgId
router.get('/_sync/by-org/:orgId', mws.requirePlatformAdmin, asyncHandler(c.listByOrg))
// R-1009 POST /course-products/_sync
router.post('/_sync', mws.requirePlatformAdmin, v.sync, mws.validateRequest, asyncHandler(c.sync))

// R-1000 GET /course-products
router.get('/', mws.requirePermission('courseProduct.read'), asyncHandler(c.list))
// R-1001 GET /course-products/:id
router.get('/:id', mws.requirePermission('courseProduct.read'), asyncHandler(c.detail))
// R-1002 POST /course-products
router.post('/', mws.requirePermission('courseProduct.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-1003 PUT /course-products/:id
router.put('/:id', mws.requirePermission('courseProduct.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除：超管+密码二次确认；互锁由 service.remove 内检查 Order/StudentProduct 引用。
// R-1004 DELETE /course-products/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// 预检：业务岗即可查询，删除按钮触发前先弹挡板说明
// R-1005 GET /course-products/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('courseProduct.read'), asyncHandler(c.removableCheck))

module.exports = router
