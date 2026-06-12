'use strict'

/**
 * 经营看板路由（report.routes）
 *
 * - 5 个 GET 接口，按业务模块挂权限码：
 *   /overview             → order.read         经营总览（核心是营收 / 订单 / 财务）
 *   /lesson-consumption   → lessonSchedule.read 课消与课表
 *   /room-utilization     → lessonSchedule.read 教室与排课利用率
 *   /teacher-productivity → lessonSchedule.read 老师产能与绩效
 *   /points-activity      → student.read         积分与家长活跃（无 points 专用权限码）
 *
 * - 全部走 authenticate + requireOrg 中间件
 * - 不需要参数校验（query 参数全 optional）
 */

const router = require('express').Router()
const c = require('./report.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/overview', mws.requirePermission('order.read'), asyncHandler(c.overview))
router.get('/lesson-consumption', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.lessonConsumption))
router.get('/room-utilization', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.roomUtilization))
router.get('/teacher-productivity', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.teacherProductivity))
router.get('/points-activity', mws.requirePermission('student.read'), asyncHandler(c.pointsActivity))

module.exports = router
