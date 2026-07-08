'use strict'

const router = require('express').Router()
const c = require('./lessonAttendance.controller')
const v = require('./lessonAttendance.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// ─── C 端家长：/me — 当前 active child 的考勤 ─────────────
// 注意：/me 必须定义在 /:id/* 之前，否则会被 :id 路由吞掉
// R-1536 GET /lesson-attendances/me（2026-07-01 立项）
//   复用 requirePermission (家长无员工权限码; activeStudent middleware 已校验是监护人)
//   默认仅返可上传作品的考勤 (status ∈ {scheduled, completed, madeup, leave})，
//   时间倒序，方便家长挑最近的课上传。
router.use(mws.activeStudent)
router.get('/me', asyncHandler(c.mine))

// ─── Admin 业务端 ──────────────────────────────────────────────
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
// 2026-07-08: 归档 / 取消归档
// R-1563 POST /lesson-attendances/:id/archive
router.post('/:id/archive', mws.requirePermission('lessonAttendance.write'), asyncHandler(c.archive))
// R-1564 POST /lesson-attendances/:id/unarchive
router.post('/:id/unarchive', mws.requirePermission('lessonAttendance.write'), asyncHandler(c.unarchive))

module.exports = router
