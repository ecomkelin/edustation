'use strict'

const router = require('express').Router()
const c = require('./courseProduct.controller')
const v = require('./courseProduct.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

/* 跨机构同步（仅平台超管可见/可用）。
   注意：必须放在 /:id 之前，否则 :id 会先抢到 "_sync" 字面量导致 404。 */
router.get('/_sync/source-orgs', mws.requirePlatformAdmin, asyncHandler(c.listSourceOrgs))
router.get('/_sync/by-org/:orgId', mws.requirePlatformAdmin, asyncHandler(c.listByOrg))
router.post('/_sync', mws.requirePlatformAdmin, v.sync, mws.validateRequest, asyncHandler(c.sync))

router.get('/', mws.requirePermission('courseProduct.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('courseProduct.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('courseProduct.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('courseProduct.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除：超管+密码二次确认；互锁由 service.remove 内检查 Order/StudentProduct 引用。
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// 预检：业务岗即可查询，删除按钮触发前先弹挡板说明
router.get('/:id/removable-check', mws.requirePermission('courseProduct.read'), asyncHandler(c.removableCheck))

module.exports = router
