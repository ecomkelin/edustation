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
// R-2900 GET /access-control/devices
adminRouter.get('/devices', mws.requirePermission('accessControl.read'), v.listDevices, mws.validateRequest, asyncHandler(c.listDevices))
// R-2901 POST /access-control/devices
adminRouter.post('/devices', mws.requirePermission('accessControl.write'), v.createDevice, mws.validateRequest, asyncHandler(c.createDevice))
// R-2902 GET /access-control/devices/:id
adminRouter.get('/devices/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getDevice))
// R-2903 PUT /access-control/devices/:id
adminRouter.put('/devices/:id', mws.requirePermission('accessControl.write'), v.idParam, v.updateDevice, mws.validateRequest, asyncHandler(c.updateDevice))
// R-2905 GET /access-control/devices/:id/removable-check
adminRouter.get('/devices/:id/removable-check', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheckDevice))
// R-2976 POST /access-control/devices/:id/regenerate-secret
adminRouter.post('/devices/:id/regenerate-secret', mws.requirePermission('accessControl.write'), v.idParam, v.regenerateSecret, mws.validateRequest, asyncHandler(c.regenerateSecret))
// R-2977 POST /access-control/devices/:id/door-state
adminRouter.post('/devices/:id/door-state', mws.requirePermission('accessControl.write'), v.idParam, v.setDoorState, mws.validateRequest, asyncHandler(c.setDoorState))
// 物理删除 (高风险): 平台超管 + 密码
// R-2904 DELETE /access-control/devices/:id
adminRouter.delete('/devices/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.removeDevice))

// ─── FaceProfile ─────────────────────────────
// R-2910 GET /access-control/face-profiles
adminRouter.get('/face-profiles', mws.requirePermission('accessControl.read'), v.listFaceProfiles, mws.validateRequest, asyncHandler(c.listFaceProfiles))
// R-2912 GET /access-control/face-profiles/:id
adminRouter.get('/face-profiles/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getFaceProfile))
// R-2911 POST /access-control/face-profiles
adminRouter.post('/face-profiles', mws.requirePermission('accessControl.write'), v.enrollFaceProfile, mws.validateRequest, asyncHandler(c.enrollFaceProfile))
// R-2913 POST /access-control/face-profiles/:id/revoke
adminRouter.post('/face-profiles/:id/revoke', mws.requirePermission('accessControl.write'), v.idParam, v.revokeFaceProfile, mws.validateRequest, asyncHandler(c.revokeFaceProfile))
// R-2915 GET /access-control/face-profiles/:id/removable-check
adminRouter.get('/face-profiles/:id/removable-check', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheckFaceProfile))
// 物理删除 (高风险)
// R-2914 DELETE /access-control/face-profiles/:id
adminRouter.delete('/face-profiles/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.removableCheckFaceProfile)) // PoC: 软删代替物理删

// ─── AccessEvent (流水) ──────────────────────
// R-2920 GET /access-control/access-events
adminRouter.get('/access-events', mws.requirePermission('accessControl.read'), v.listAccessEvents, mws.validateRequest, asyncHandler(c.listAccessEvents))
// R-2927 GET /access-control/access-events/stats
adminRouter.get('/access-events/stats', mws.requirePermission('accessControl.read'), mws.validateRequest, asyncHandler(c.getAccessEventStats))
// R-2922 GET /access-control/access-events/:id
adminRouter.get('/access-events/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getAccessEvent))

// ─── AuthorizedPickup ────────────────────────
// R-2930 GET /access-control/pickups
adminRouter.get('/pickups', mws.requirePermission('accessControl.read'), v.listPickups, mws.validateRequest, asyncHandler(c.listPickups))
// R-2932 GET /access-control/pickups/:id
adminRouter.get('/pickups/:id', mws.requirePermission('accessControl.read'), v.idParam, mws.validateRequest, asyncHandler(c.getPickup))
// R-2931 POST /access-control/pickups
adminRouter.post('/pickups', mws.requirePermission('accessControl.pickup'), v.createPickup, mws.validateRequest, asyncHandler(c.createPickup))
// R-2933 PUT /access-control/pickups/:id
adminRouter.put('/pickups/:id', mws.requirePermission('accessControl.pickup'), v.idParam, v.updatePickup, mws.validateRequest, asyncHandler(c.updatePickup))
// R-2934 POST /access-control/pickups/:id/revoke
adminRouter.post('/pickups/:id/revoke', mws.requirePermission('accessControl.pickup'), v.idParam, v.revokePickup, mws.validateRequest, asyncHandler(c.revokePickup))

// ─── FaceConsent (UserConsent 复用) ──────────
// R-2940 GET /access-control/consent/template
adminRouter.get('/consent/template', mws.requirePermission('accessControl.read'), mws.validateRequest, asyncHandler(c.getConsentTemplate))

/* ═══════ Client 端 (家长小程序, auth + requireOrg) ═══════ */

const clientRouter = express.Router()
clientRouter.use(mws.authenticate, mws.requireOrg)

// ─── FaceProfile (家长) ──────────────────────
// R-2970 POST /access-control/client/face-profiles/enroll-my-child
clientRouter.post(
  '/face-profiles/enroll-my-child',
  mws.activeStudent,
  v.clientEnrollMyChild,
  mws.validateRequest,
  asyncHandler(c.clientEnrollMyChild)
)
// R-2971 POST /access-control/client/face-profiles/enroll-self
clientRouter.post(
  '/face-profiles/enroll-self',
  v.clientEnrollSelf,
  mws.validateRequest,
  asyncHandler(c.clientEnrollSelf)
)

// ─── AuthorizedPickup (家长) ─────────────────
// R-2973 GET /access-control/client/pickups
clientRouter.get('/pickups', mws.activeStudent, asyncHandler(c.clientListPickups))
// R-2972 POST /access-control/client/pickups
clientRouter.post(
  '/pickups',
  mws.activeStudent,
  v.clientCreatePickup,
  mws.validateRequest,
  asyncHandler(c.clientCreatePickup)
)
// R-2974 POST /access-control/client/pickups/:id/revoke
clientRouter.post(
  '/pickups/:id/revoke',
  mws.activeStudent,
  v.idParam,
  v.revokePickup,
  mws.validateRequest,
  asyncHandler(c.clientRevokePickup)
)

// ─── AccessEvent (家长) ──────────────────────
// R-2978 GET /access-control/client/access-events/as-pickup
clientRouter.get('/access-events/as-pickup', asyncHandler(c.clientListMyAccessEvents))
// R-2975 GET /access-control/client/access-events/my-child
clientRouter.get(
  '/access-events/my-child',
  mws.activeStudent,
  asyncHandler(c.clientListMyChildAccessEvents)
)

// ─── FaceConsent (家长) ──────────────────────
// R-2943 GET /access-control/client/consent/my
clientRouter.get('/consent/my', asyncHandler(c.listMyConsents))
// R-2944 POST /access-control/client/consent/sign
clientRouter.post('/consent/sign', v.signConsent, mws.validateRequest, asyncHandler(c.signConsent))
// R-2945 POST /access-control/client/consent/:id/withdraw
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
