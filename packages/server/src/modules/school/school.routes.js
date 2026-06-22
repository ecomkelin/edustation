'use strict'

const router = require('express').Router()
const c = require('./school.controller')
const v = require('./school.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-0800 GET /schools
router.get('/', mws.requirePermission('school.read'), asyncHandler(c.list))
// R-0801 GET /schools/:id
router.get('/:id', mws.requirePermission('school.read'), asyncHandler(c.detail))
// R-0802 POST /schools
router.post('/', mws.requirePermission('school.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-0803 PUT /schools/:id
router.put('/:id', mws.requirePermission('school.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除：超管+密码二次确认；互锁检查 Student.school（org+isActive=true 的在册学生）。
// 已停用学生不强挡（视为"已无业务关联"）。
// R-0804 DELETE /schools/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// R-0805 GET /schools/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('school.read'), asyncHandler(c.removableCheck))

module.exports = router
