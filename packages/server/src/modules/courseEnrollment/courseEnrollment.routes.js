'use strict'

const router = require('express').Router()
const c = require('./courseEnrollment.controller')
const v = require('./courseEnrollment.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-1200 GET /course-enrollments
router.get('/', mws.requirePermission('courseEnrollment.read'), asyncHandler(c.list))
// R-1201 GET /course-enrollments/:id
router.get('/:id', mws.requirePermission('courseEnrollment.read'), asyncHandler(c.detail))
// R-1202 POST /course-enrollments
router.post('/', mws.requirePermission('courseEnrollment.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// 调整班级（分班）
// R-1203 PUT /course-enrollments/:id
router.put('/:id', mws.requirePermission('courseEnrollment.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// R-1213 PUT /course-enrollments/:id/status
router.put('/:id/status', mws.requirePermission('courseEnrollment.write'), v.setStatus, mws.validateRequest, asyncHandler(c.setStatus))
// 「误操」物理删除:超管 + 二次密码统一由 requirePlatformPassword 中间件把守。
// 业务校验(仅 enrolled 状态可删)在 service 层做。
// R-1204 DELETE /course-enrollments/:id
router.delete('/:id', mws.requirePlatformPassword, v.remove, mws.validateRequest, asyncHandler(c.remove))
// 预检:只读,业务岗(.read 权限)可看阻挡原因。
// R-1205 GET /course-enrollments/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('courseEnrollment.read'), asyncHandler(c.removableCheck))

module.exports = router
