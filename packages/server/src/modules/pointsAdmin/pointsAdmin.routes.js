'use strict'

/**
 * 积分管理（admin 端）路由
 *
 * 基础路径：`/api/v1/points-admin`
 *
 * 与家长端 `/api/v1/points/*` 完全分开：
 *   - 家长端: mws.activeStudent 强制当前激活子女
 *   - admin 端: 无 activeStudent；按 req.params.studentId 或 query.studentId 操作
 *
 * 中间件链：mws.authenticate → mws.requireOrg → mws.requirePermission(...)
 *   - 只读端点 (list/get): points.read
 *   - 写端点 (adjust):     points.write
 */

const router = require('express').Router()
const c = require('./pointsAdmin.controller')
const v = require('./pointsAdmin.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// 只读 (points.read)
// R-2100 GET /points-admin/accounts
router.get(
  '/accounts',
  mws.requirePermission('points.read'),
  v.listAccounts,
  mws.validateRequest,
  asyncHandler(c.listAccounts)
)

// R-2101 GET /points-admin/accounts/:studentId
router.get(
  '/accounts/:studentId',
  mws.requirePermission('points.read'),
  v.studentIdParam,
  mws.validateRequest,
  asyncHandler(c.getAccount)
)

// R-2110 GET /points-admin/transactions
router.get(
  '/transactions',
  mws.requirePermission('points.read'),
  v.listTransactions,
  mws.validateRequest,
  asyncHandler(c.listTransactions)
)

// R-2106 GET /points-admin/reasons
router.get(
  '/reasons',
  mws.requirePermission('points.read'),
  asyncHandler(c.listReasons)
)

// 写 (points.write)
// R-2115 POST /points-admin/accounts/:studentId/adjust
router.post(
  '/accounts/:studentId/adjust',
  mws.requirePermission('points.write'),
  v.studentIdParam,
  v.adjust,
  mws.validateRequest,
  asyncHandler(c.adjust)
)

module.exports = router
