'use strict'

/**
 * 经营看板路由（report.routes）
 *
 * - 5 个 GET 接口，统一挂 report.read 权限码（2026-06 新增，packages/shared/permissions.json）
 *   /overview             → 经营总览（营收 / 订单 / 学员 / 课包 / 出勤率）
 *   /lesson-consumption   → 课消与课表
 *   /room-utilization     → 教室与排课利用率
 *   /teacher-productivity → 老师产能与绩效
 *   /points-activity      → 积分与家长活跃
 *
 * - 全部走 authenticate + requireOrg 中间件
 * - 不需要参数校验（query 参数全 optional）
 * - service 层有 60s 进程内缓存（reportCache.js）；写操作后自动失效
 */

const router = require('express').Router()
const c = require('./report.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/overview', mws.requirePermission('report.read'), asyncHandler(c.overview))
router.get('/lesson-consumption', mws.requirePermission('report.read'), asyncHandler(c.lessonConsumption))
router.get('/room-utilization', mws.requirePermission('report.read'), asyncHandler(c.roomUtilization))
router.get('/teacher-productivity', mws.requirePermission('report.read'), asyncHandler(c.teacherProductivity))
router.get('/points-activity', mws.requirePermission('report.read'), asyncHandler(c.pointsActivity))

module.exports = router
