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
// 物理删除(「误操」场景):仅超管可执行,且需输入自己的登录密码二次确认;
// 业务上要求"无 StudentProduct / CourseInstance 引用"才允许(由 service 检查)。
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
