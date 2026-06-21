'use strict'

const express = require('express')
const router = express.Router()
const c = require('./accessControl.controller')
const v = require('./accessControl.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

/* ------------------------------------------------------------------
 * 人脸识别门禁 (accessControl) 路由表
 *
 * 权限码:
 *   - accessControl.read:   设备/人脸档案/流水/接送授权的查看
 *   - accessControl.write:  设备配置/录入/撤销人脸/切换门状态
 *   - accessControl.pickup: 接送授权管理
 *
 * 三类入口:
 *   1. Webhook (无 auth, 走 webhookAuth 中间件 HMAC 验签) — 见 accessControl.webhookRoutes.js
 *      在 app.js 中先于 express.json 挂载, 保证 req.rawBody 可用
 *   2. Admin 端 (auth + requireOrg + accessControl.*)
 *   3. Client 端 (auth + requireOrg + 部分走 requireActiveStudent)
 * ------------------------------------------------------------------ */

/* ═══════ Admin 端 (auth + requireOrg) ═══════ */

const adminRouter = express.Router()
adminRouter.use(mws.authenticate, mws.requireOrg)

// ─── AccessDevice ────────────────────────────
adminRouter.get('/devices', mws.requirePermission('accessControl.read'), v.listDevices, mws.validateRequest, asyncHandler(c.listDevices))
adminRouter.post('/devices', mws.requirePermission('accessControl.write'), v.createDevice, mws.validateRequest, asyncHandler(c.createDevice))
adminRouter.get('/devices/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getDevice))
adminRouter.put('/devices/:id', mws.requirePermission('accessControl.write'), v.idParam, v.updateDevice, mws.validateRequest, asyncHandler(c.updateDevice))
adminRouter.get('/devices/:id/removable-check', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheckDevice))
adminRouter.post('/devices/:id/regenerate-secret', mws.requirePermission('accessControl.write'), v.idParam, v.regenerateSecret, mws.validateRequest, asyncHandler(c.regenerateSecret))
adminRouter.post('/devices/:id/door-state', mws.requirePermission('accessControl.write'), v.idParam, v.setDoorState, mws.validateRequest, asyncHandler(c.setDoorState))
// 物理删除 (高风险): 平台超管 + 密码
adminRouter.delete('/devices/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.removeDevice))

// ─── FaceProfile ─────────────────────────────
adminRouter.get('/face-profiles', mws.requirePermission('accessControl.read'), v.listFaceProfiles, mws.validateRequest, asyncHandler(c.listFaceProfiles))
adminRouter.get('/face-profiles/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getFaceProfile))
adminRouter.post('/face-profiles', mws.requirePermission('accessControl.write'), v.enrollFaceProfile, mws.validateRequest, asyncHandler(c.enrollFaceProfile))
adminRouter.post('/face-profiles/:id/revoke', mws.requirePermission('accessControl.write'), v.idParam, v.revokeFaceProfile, mws.validateRequest, asyncHandler(c.revokeFaceProfile))
adminRouter.get('/face-profiles/:id/removable-check', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheckFaceProfile))
// 物理删除 (高风险)
adminRouter.delete('/face-profiles/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.removableCheckFaceProfile)) // PoC: 软删代替物理删

// ─── AccessEvent (流水) ──────────────────────
adminRouter.get('/access-events', mws.requirePermission('accessControl.read'), v.listAccessEvents, mws.validateRequest, asyncHandler(c.listAccessEvents))
adminRouter.get('/access-events/stats', mws.requirePermission('accessControl.read'), mws.validateRequest, asyncHandler(c.getAccessEventStats))
adminRouter.get('/access-events/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getAccessEvent))

// ─── AuthorizedPickup ────────────────────────
adminRouter.get('/pickups', mws.requirePermission('accessControl.read'), v.listPickups, mws.validateRequest, asyncHandler(c.listPickups))
adminRouter.get('/pickups/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getPickup))
adminRouter.post('/pickups', mws.requirePermission('accessControl.pickup'), v.createPickup, mws.validateRequest, asyncHandler(c.createPickup))
adminRouter.put('/pickups/:id', mws.requirePermission('accessControl.pickup'), v.idParam, v.updatePickup, mws.validateRequest, asyncHandler(c.updatePickup))
adminRouter.post('/pickups/:id/revoke', mws.requirePermission('accessControl.pickup'), v.idParam, v.revokePickup, mws.validateRequest, asyncHandler(c.revokePickup))

// ─── FaceConsent (UserConsent 复用) ──────────
adminRouter.get('/consent/template', mws.requirePermission('accessControl.read'), mws.validateRequest, asyncHandler(c.getConsentTemplate))

/* ═══════ Client 端 (家长小程序, auth + requireOrg) ═══════ */

const clientRouter = express.Router()
clientRouter.use(mws.authenticate, mws.requireOrg)

// ─── FaceProfile (家长) ──────────────────────
clientRouter.post(
  '/face-profiles/enroll-my-child',
  mws.activeStudent,
  v.clientEnrollMyChild,
  mws.validateRequest,
  asyncHandler(c.clientEnrollMyChild)
)
clientRouter.post(
  '/face-profiles/enroll-self',
  v.clientEnrollSelf,
  mws.validateRequest,
  asyncHandler(c.clientEnrollSelf)
)

// ─── AuthorizedPickup (家长) ─────────────────
clientRouter.get('/pickups', mws.activeStudent, asyncHandler(c.clientListPickups))
clientRouter.post(
  '/pickups',
  mws.activeStudent,
  v.clientCreatePickup,
  mws.validateRequest,
  asyncHandler(c.clientCreatePickup)
)
clientRouter.post(
  '/pickups/:id/revoke',
  mws.activeStudent,
  v.idParam,
  v.revokePickup,
  mws.validateRequest,
  asyncHandler(c.clientRevokePickup)
)

// ─── AccessEvent (家长) ──────────────────────
clientRouter.get('/access-events/as-pickup', asyncHandler(c.clientListMyAccessEvents))
clientRouter.get(
  '/access-events/my-child',
  mws.activeStudent,
  asyncHandler(c.clientListMyChildAccessEvents)
)

// ─── FaceConsent (家长) ──────────────────────
clientRouter.get('/consent/my', asyncHandler(c.listMyConsents))
clientRouter.post('/consent/sign', v.signConsent, mws.validateRequest, asyncHandler(c.signConsent))
clientRouter.post(
  '/consent/:id/withdraw',
  v.idParam,
  v.withdrawConsent,
  mws.validateRequest,
  asyncHandler(c.withdrawConsent)
)

// 挂载子路由
router.use('/', adminRouter)
router.use('/client', clientRouter)

module.exports = router
