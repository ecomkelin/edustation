'use strict'

const router = require('express').Router()
const c = require('./courseEnrollment.controller')
const v = require('./courseEnrollment.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('courseEnrollment.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('courseEnrollment.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('courseEnrollment.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// 调整班级（分班）
router.put('/:id', mws.requirePermission('courseEnrollment.write'), v.update, mws.validateRequest, asyncHandler(c.update))
router.put('/:id/status', mws.requirePermission('courseEnrollment.write'), v.setStatus, mws.validateRequest, asyncHandler(c.setStatus))
// 「误操」物理删除:仅平台超管;密码二次确认由 service 层做。
// 误操之外的所有报名状态变更一律走 PUT /:id/status。
router.delete('/:id', mws.requirePlatformAdmin, v.remove, mws.validateRequest, asyncHandler(c.remove))

module.exports = router
