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
// 「误操」物理删除:超管 + 二次密码统一由 requirePlatformPassword 中间件把守。
// 业务校验(仅 enrolled 状态可删)在 service 层做。
router.delete('/:id', mws.requirePlatformPassword, v.remove, mws.validateRequest, asyncHandler(c.remove))
// 预检:只读,业务岗(.read 权限)可看阻挡原因。
router.get('/:id/removable-check', mws.requirePermission('courseEnrollment.read'), asyncHandler(c.removableCheck))

module.exports = router
