'use strict'

const router = require('express').Router()
const c = require('./room.controller')
const v = require('./room.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('room.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('room.read'), asyncHandler(c.detail))
router.post('/', mws.requirePermission('room.write'), v.create, mws.validateRequest, asyncHandler(c.create))
router.put('/:id', mws.requirePermission('room.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除：超管+密码二次确认；互锁检查 CourseInstance.room(deletedAt=null) /
// LessonSchedule.room(status≠archived)。已归档开班/已归档排课不挡（历史不再展示）。
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
router.get('/:id/removable-check', mws.requirePermission('room.read'), asyncHandler(c.removableCheck))

module.exports = router
