'use strict'

const router = require('express').Router()
const c = require('./points.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// /points/* 是 C 端孩子积分账户, 走 activeStudent 中间件 (按 req.activeStudentId 隔离).
// 注意: /earn 在下面单独挂 requirePermission('points.write'), 不放在 router.use 链里,
//   否则 /me /transactions 也需要 points.write 权限, 违反 C 端调用链.
router.use(mws.authenticate, mws.requireOrg, mws.activeStudent)

// R-2072 GET /points/me
router.get('/me', asyncHandler(c.me))
// R-2060 POST /points/earn
// 2026-08-05: 积分自助刷分堵口 (审计 S3)
//   之前无 requirePermission 守卫 + controller 把 body.student/amount/trigger 全透传
//   → 家长可任意刷积分. 现在挂 requirePermission('points.write') 强制业务岗才有权;
//   阶段 3 分享得积分 / 签到 等 C 端业务应另起专用端点 (e.g. /points/earn-from-share) + 服务端 trigger 白名单,
//   而不是把这条 internal 端点对家长暴露.
router.post('/earn', mws.requirePermission('points.write'), asyncHandler(c.earn)) // staff-only
// R-2000 GET /points/transactions
router.get('/transactions', asyncHandler(c.transactions))

module.exports = router
