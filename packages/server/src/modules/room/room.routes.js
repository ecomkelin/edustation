'use strict'

const router = require('express').Router()
const c = require('./room.controller')
const v = require('./room.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-1300 GET /rooms
router.get('/', mws.requirePermission('room.read'), asyncHandler(c.list))
// R-1301 GET /rooms/:id
router.get('/:id', mws.requirePermission('room.read'), asyncHandler(c.detail))
// R-1302 POST /rooms
router.post('/', mws.requirePermission('room.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// R-1303 PUT /rooms/:id
router.put('/:id', mws.requirePermission('room.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除：超管+密码二次确认；互锁检查 CourseInstance.room(deletedAt=null) /
// LessonSchedule.room(status≠archived)。已归档开班/已归档排课不挡（历史不再展示）。
// R-1304 DELETE /rooms/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
// R-1305 GET /rooms/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('room.read'), asyncHandler(c.removableCheck))

module.exports = router
