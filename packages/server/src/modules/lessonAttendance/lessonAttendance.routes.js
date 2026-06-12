'use strict'

const router = require('express').Router()
const c = require('./lessonAttendance.controller')
const v = require('./lessonAttendance.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/', mws.requirePermission('lessonAttendance.read'), asyncHandler(c.list))
// 教务手动添加单条考勤（preparing 之后补报名 / 补名单）
router.post('/', mws.requirePermission('lessonAttendance.write'), v.addManual, mws.validateRequest, asyncHandler(c.addManual))
router.post('/check-in', mws.requirePermission('lessonAttendance.write'), v.checkIn, mws.validateRequest, asyncHandler(c.checkIn))
// 开课批量登记（一次保存一节课所有学生的考勤状态）
router.post('/bulk-mark', mws.requirePermission('lessonAttendance.write'), v.bulkMark, mws.validateRequest, asyncHandler(c.bulkMark))
router.put('/:id/complete', mws.requirePermission('lessonAttendance.write'), v.complete, mws.validateRequest, asyncHandler(c.complete))
router.put('/:id/no-show', mws.requirePermission('lessonAttendance.write'), v.noShow, mws.validateRequest, asyncHandler(c.noShow))
router.put('/:id/evaluation', mws.requirePermission('lessonAttendance.write'), v.updateEvaluation, mws.validateRequest, asyncHandler(c.updateEvaluation))
router.get('/:id/works', mws.requirePermission('studentWork.read'), asyncHandler(c.works))
// 「补课」：为已结束/已归档排课的某条未消课考勤补建一条 completed记录
router.post('/:id/makeup', mws.requirePermission('lessonAttendance.write'), v.makeup, mws.validateRequest, asyncHandler(c.makeup))

module.exports = router
