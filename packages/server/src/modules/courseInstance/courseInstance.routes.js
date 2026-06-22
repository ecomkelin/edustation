'use strict'

const router = require('express').Router()
const c = require('./courseInstance.controller')
const v = require('./courseInstance.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-1100 GET /course-instances
router.get('/', mws.requirePermission('courseInstance.read'), asyncHandler(c.list))
// R-1101 GET /course-instances/:id
router.get('/:id', mws.requirePermission('courseInstance.read'), asyncHandler(c.detail))
// R-1102 POST /course-instances
router.post('/', mws.requirePermission('courseInstance.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-1103 PUT /course-instances/:id
router.put('/:id', mws.requirePermission('courseInstance.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 状态变更：cancelled 仅超管，其他状态需要 write；service 层做精细控制
// R-1113 PUT /course-instances/:id/status
router.put('/:id/status', mws.requirePermission('courseInstance.write'), v.setStatus, mws.validateRequest, asyncHandler(c.setStatus))
// 软删:超管 + 二次密码;状态(planning/cancelled)与业务互锁在 service 层校验。
// R-1104 DELETE /course-instances/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// 预检:只读,业务岗(.read 权限)可看阻挡原因;不做删除。
// R-1105 GET /course-instances/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('courseInstance.read'), asyncHandler(c.removableCheck))

module.exports = router
