'use strict'

const s = require('./accessControl.service')
const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')

/**
 * Admin 端 controller
 */

// ─── AccessDevice ──────────────────────────────────
exports.listDevices = async (req, res) => {
  const data = await s.listDevices({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.getDevice = async (req, res) => {
  const data = await s.getDevice({ orgId: req.orgId, id: req.params.id })
  res.json(ApiResponse.ok(data))
}

exports.createDevice = async (req, res) => {
  const data = await s.createDevice({
    orgId: req.orgId,
    operatorId: req.user.id,
    payload: req.body
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.updateDevice = async (req, res) => {
  const data = await s.updateDevice({
    orgId: req.orgId,
    id: req.params.id,
    payload: req.body
  })
  res.json(ApiResponse.ok(data))
}

exports.removeDevice = async (req, res) => {
  await s.removeDevice({ orgId: req.orgId, id: req.params.id })
  res.json(ApiResponse.ok({ success: true }))
}

exports.removableCheckDevice = async (req, res) => {
  const data = await s.removableCheckDevice({ orgId: req.orgId, id: req.params.id })
  res.json(ApiResponse.ok(data))
}

exports.regenerateSecret = async (req, res) => {
  const data = await s.regenerateSecret({
    orgId: req.orgId,
    id: req.params.id,
    newSigningKey: req.body.newSigningKey
  })
  res.json(ApiResponse.ok(data))
}

exports.setDoorState = async (req, res) => {
  const data = await s.setDoorState({
    orgId: req.orgId,
    id: req.params.id,
    mode: req.body.mode,
    reason: req.body.reason,
    operatorId: req.user.id
  })
  res.json(ApiResponse.ok(data))
}

// Webhook (无 auth, 走 webhookAuth.middleware)
exports.webhook = async (req, res) => {
  const sourceIp =
    (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || ''
  const data = await s.recordEvent({
    device: req.accessDevice,
    rawPayload: req.body || {},
    sourceIp
  })
  res.json(ApiResponse.ok(data))
}

exports.heartbeat = async (req, res) => {
  await s.recordHeartbeat({ deviceId: req.accessDevice._id })
  res.json(ApiResponse.ok({ ok: true }))
}

// ─── FaceProfile ───────────────────────────────────
exports.listFaceProfiles = async (req, res) => {
  const data = await s.listFaceProfiles({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.getFaceProfile = async (req, res) => {
  const data = await s.getFaceProfile({ orgId: req.orgId, id: req.params.id })
  res.json(ApiResponse.ok(data))
}

exports.enrollFaceProfile = async (req, res) => {
  // 录入时可能上传清晰人脸照 (multipart 'photo' 字段)
  // PoC 简化: 仅记录 enrollmentPhoto=null; v2 走 storage.service.uploadOne
  const data = await s.enrollFaceProfile({
    orgId: req.orgId,
    operatorId: req.user.id,
    payload: req.body,
    photoUpload: null
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.revokeFaceProfile = async (req, res) => {
  const data = await s.revokeFaceProfile({
    orgId: req.orgId,
    id: req.params.id,
    operatorId: req.user.id,
    reason: req.body.revokeReason
  })
  res.json(ApiResponse.ok(data))
}

exports.removableCheckFaceProfile = async (req, res) => {
  const data = await s.removableCheckFaceProfile({ orgId: req.orgId, id: req.params.id })
  res.json(ApiResponse.ok(data))
}

// ─── AccessEvent ───────────────────────────────────
exports.listAccessEvents = async (req, res) => {
  const data = await s.listAccessEvents({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.getAccessEvent = async (req, res) => {
  const data = await s.getAccessEvent({ orgId: req.orgId, id: req.params.id })
  res.json(ApiResponse.ok(data))
}

exports.getAccessEventStats = async (req, res) => {
  const data = await s.getAccessEventStats({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

// ─── AuthorizedPickup ──────────────────────────────
exports.listPickups = async (req, res) => {
  const data = await s.listPickups({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.getPickup = async (req, res) => {
  const data = await s.getPickup({ orgId: req.orgId, id: req.params.id })
  res.json(ApiResponse.ok(data))
}

exports.createPickup = async (req, res) => {
  const data = await s.createPickup({
    orgId: req.orgId,
    operatorId: req.user.id,
    payload: req.body
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.updatePickup = async (req, res) => {
  const data = await s.updatePickup({ orgId: req.orgId, id: req.params.id, payload: req.body })
  res.json(ApiResponse.ok(data))
}

exports.revokePickup = async (req, res) => {
  const data = await s.revokePickup({
    orgId: req.orgId,
    id: req.params.id,
    operatorId: req.user.id,
    reason: req.body.revokeReason
  })
  res.json(ApiResponse.ok(data))
}

// ─── FaceConsent (复用 UserConsent) ───────────────
exports.getConsentTemplate = async (req, res) => {
  const docKey = req.query.docKey
  if (!docKey) return res.status(400).json(ApiResponse.fail('缺少 docKey', 400))
  const data = await s.getConsentTemplate({ orgId: req.orgId, docKey })
  res.json(ApiResponse.ok(data))
}

exports.listMyConsents = async (req, res) => {
  const data = await s.listMyConsents({ userId: req.user.id, orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}

exports.signConsent = async (req, res) => {
  const data = await s.signConsent({
    payload: req.body,
    context: {
      userId: req.user.id,
      orgId: req.orgId,
      ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '',
      userAgent: req.get('User-Agent') || ''
    }
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.withdrawConsent = async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || ''
  const data = await s.withdrawConsent({
    orgId: req.orgId,
    consentId: req.params.id,
    userId: req.user.id,
    reason: req.body.reason,
    ip
  })
  res.json(ApiResponse.ok(data))
}

/**
 * Client 端 controller (家长小程序)
 *
 * 入口已在 routes.js 走 authenticate + requireOrg;
 * 涉及 active student 的端点额外走 requireActiveStudent 中间件。
 */
exports.clientEnrollMyChild = async (req, res) => {
  const data = await s.clientEnrollMyChild({
    orgId: req.orgId,
    userId: req.user.id,
    activeStudentId: req.activeStudentId,
    payload: req.body,
    photoUpload: null
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.clientEnrollSelf = async (req, res) => {
  const data = await s.clientEnrollSelf({
    orgId: req.orgId,
    userId: req.user.id,
    payload: req.body,
    photoUpload: null
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.clientListPickups = async (req, res) => {
  const data = await s.clientListPickups({
    orgId: req.orgId,
    userId: req.user.id,
    activeStudentId: req.activeStudentId
  })
  res.json(ApiResponse.ok(data))
}

exports.clientCreatePickup = async (req, res) => {
  const data = await s.clientCreatePickup({
    orgId: req.orgId,
    userId: req.user.id,
    activeStudentId: req.activeStudentId,
    payload: req.body
  })
  res.status(201).json(ApiResponse.created(data))
}

exports.clientRevokePickup = async (req, res) => {
  const data = await s.clientRevokePickup({
    orgId: req.orgId,
    userId: req.user.id,
    id: req.params.id,
    reason: req.body.revokeReason
  })
  res.json(ApiResponse.ok(data))
}

exports.clientListMyAccessEvents = async (req, res) => {
  const data = await s.clientListMyAccessEvents({
    orgId: req.orgId,
    userId: req.user.id,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(data))
}

exports.clientListMyChildAccessEvents = async (req, res) => {
  const data = await s.clientListMyChildAccessEvents({
    orgId: req.orgId,
    userId: req.user.id,
    activeStudentId: req.activeStudentId,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(data))
}
