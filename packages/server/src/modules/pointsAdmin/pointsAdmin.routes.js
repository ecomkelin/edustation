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
router.get(
  '/accounts',
  mws.requirePermission('points.read'),
  v.listAccounts,
  mws.validateRequest,
  asyncHandler(c.listAccounts)
)

router.get(
  '/accounts/:studentId',
  mws.requirePermission('points.read'),
  v.studentIdParam,
  mws.validateRequest,
  asyncHandler(c.getAccount)
)

router.get(
  '/transactions',
  mws.requirePermission('points.read'),
  v.listTransactions,
  mws.validateRequest,
  asyncHandler(c.listTransactions)
)

router.get(
  '/reasons',
  mws.requirePermission('points.read'),
  asyncHandler(c.listReasons)
)

// 写 (points.write)
router.post(
  '/accounts/:studentId/adjust',
  mws.requirePermission('points.write'),
  v.studentIdParam,
  v.adjust,
  mws.validateRequest,
  asyncHandler(c.adjust)
)

module.exports = router
