'use strict'

const router = require('express').Router()
const c = require('./lessonAttendance.controller')
const v = require('./lessonAttendance.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-1500 GET /lesson-attendances
router.get('/', mws.requirePermission('lessonAttendance.read'), asyncHandler(c.list))
// 教务手动添加单条考勤（preparing 之后补报名 / 补名单）
// R-1502 POST /lesson-attendances
router.post('/', mws.requirePermission('lessonAttendance.write'), v.addManual, mws.validateRequest, asyncHandler(c.addManual))
// R-1526 POST /lesson-attendances/check-in
router.post('/check-in', mws.requirePermission('lessonAttendance.write'), v.checkIn, mws.validateRequest, asyncHandler(c.checkIn))
// 开课批量登记（一次保存一节课所有学生的考勤状态）
// R-1542 POST /lesson-attendances/bulk-mark
router.post('/bulk-mark', mws.requirePermission('lessonAttendance.write'), v.bulkMark, mws.validateRequest, asyncHandler(c.bulkMark))
// R-1527 PUT /lesson-attendances/:id/complete
router.put('/:id/complete', mws.requirePermission('lessonAttendance.write'), v.complete, mws.validateRequest, asyncHandler(c.complete))
// R-1528 PUT /lesson-attendances/:id/no-show
router.put('/:id/no-show', mws.requirePermission('lessonAttendance.write'), v.noShow, mws.validateRequest, asyncHandler(c.noShow))
// R-1529 PUT /lesson-attendances/:id/evaluation
router.put('/:id/evaluation', mws.requirePermission('lessonAttendance.write'), v.updateEvaluation, mws.validateRequest, asyncHandler(c.updateEvaluation))
// R-1530 GET /lesson-attendances/:id/works
router.get('/:id/works', mws.requirePermission('studentWork.read'), asyncHandler(c.works))
// 「补课」：为已结束/已归档排课的某条未消课考勤补建一条 completed记录
// R-1562 POST /lesson-attendances/:id/makeup
router.post('/:id/makeup', mws.requirePermission('lessonAttendance.write'), v.makeup, mws.validateRequest, asyncHandler(c.makeup))

module.exports = router
