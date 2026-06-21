'use strict'

const crypto = require('crypto')
const mongoose = require('mongoose')
const AccessDevice = require('@models/AccessDevice.model')
const FaceProfile = require('@models/FaceProfile.model')
const AccessEvent = require('@models/AccessEvent.model')
const AuthorizedPickup = require('@models/AuthorizedPickup.model')
const UserConsent = require('@models/UserConsent.model')
const Student = require('@models/Student.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const File = require('@models/File.model')
const LegalDoc = require('@models/LegalDoc.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { normalizePagination } = require('@utils/pagination')
const {
  AccessResult,
  LivenessResult,
  SnapshotKind,
  FACE_PROFILE_SUBJECT_TYPES
} = require('@shared/enums')
const { getDriver } = require('./drivers')

/**
 * 人脸识别门禁 (accessControl) 业务逻辑
 *
 * 设计要点 (CLAUDE.md §17):
 *  - Webhook 入口在 controller (express.raw 收 raw body) → service.recordEvent
 *  - 防重放: 走 (org, device, deviceEventId) 复合唯一索引 (Mongo 自动幂等)
 *  - 强制规则: livenessResult !== 'passed' → result='denied'
 *  - snapshot 走 File 系统, 30 天后由 cron 清 (PoC 暂不实现 cron, 手动 SQL 清理)
 *  - 同意书复用 UserConsent, 撤回走 withrawAt (不物理删)
 *  - 客户端隔离: requireActiveStudent + guardians 校验
 */

// ═══════════════════════════════════════════════════════════════
// 1. AccessDevice
// ═══════════════════════════════════════════════════════════════

async function listDevices({ orgId, keyword, isActive, vendor, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (typeof isActive === 'boolean') filter.isActive = isActive
  if (vendor) filter.vendor = vendor
  if (keyword) {
    const re = { $regex: keyword, $options: 'i' }
    filter.$or = [{ name: re }, { deviceSn: re }, { location: re }, { vendorModel: re }]
  }
  const [items, total] = await Promise.all([
    AccessDevice.find(filter)
      .select('-webhookSigningKey') // 列表绝不返回 signing key
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    AccessDevice.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function getDevice({ orgId, id }) {
  const d = await AccessDevice.findOne({ _id: id, org: orgId })
    .select('-webhookSigningKey')
    .lean()
  if (!d) throw ApiError.notFound('设备不存在')
  return d
}

async function createDevice({ orgId, operatorId, payload }) {
  try {
    const d = await AccessDevice.create({ ...payload, org: orgId, registeredBy: operatorId })
    // 列表不返回 key, 但 create 响应里一次性返回 (admin 配设备时用)
    return d.toObject()
  } catch (e) {
    if (e && e.code === 11000) {
      throw ApiError.conflict('本机构已存在相同 deviceSn 的设备')
    }
    throw e
  }
}

async function updateDevice({ orgId, id, payload }) {
  // 不允许通过 update 改 webhookSigningKey (走 regenerateSecret)
  delete payload.webhookSigningKey
  const d = await AccessDevice.findOneAndUpdate({ _id: id, org: orgId }, { $set: payload }, { new: true })
    .select('-webhookSigningKey')
    .lean()
  if (!d) throw ApiError.notFound('设备不存在')
  return d
}

async function removeDevice({ orgId, id }) {
  await removable.assertUnused(orgId, [
    {
      model: AccessEvent,
      filter: { device: id, org: orgId },
      label: '进出流水',
      hint: '该设备已有进出记录, 不可物理删除; 如不再使用请用 PUT /:id {isActive:false} 停用'
    },
    {
      model: FaceProfile,
      filter: { org: orgId, deviceIds: id },
      label: '人脸档案同步',
      hint: '该设备已同步了 N 张人脸档案, 请先撤销这些档案或从 deviceIds 移除'
    }
  ])
  await AccessDevice.deleteOne({ _id: id, org: orgId })
  return { success: true }
}

async function removableCheckDevice({ orgId, id }) {
  return removable.check(orgId, [
    {
      model: AccessEvent,
      filter: { device: id, org: orgId },
      label: '进出流水',
      hint: '该设备已有进出记录, 不可物理删除; 如不再使用请用 PUT /:id {isActive:false} 停用'
    },
    {
      model: FaceProfile,
      filter: { org: orgId, deviceIds: id },
      label: '人脸档案同步',
      hint: '请先撤销这些档案或从 deviceIds 移除后再删'
    }
  ])
}

async function regenerateSecret({ orgId, id, newSigningKey }) {
  const key = newSigningKey || crypto.randomBytes(32).toString('hex')
  const d = await AccessDevice.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: { webhookSigningKey: key } },
    { new: true }
  )
    .select('_id name deviceSn')
    .lean()
  if (!d) throw ApiError.notFound('设备不存在')
  // 一次性返回新 key, 不再返回旧 key
  return { ...d, newSigningKey: key, _oneTimeShow: true }
}

async function setDoorState({ orgId, id, mode, reason, operatorId }) {
  const d = await AccessDevice.findOneAndUpdate(
    { _id: id, org: orgId },
    {
      $set: {
        'doorState.mode': mode,
        'doorState.changedBy': operatorId,
        'doorState.changedAt': new Date(),
        'doorState.reason': reason || ''
      }
    },
    { new: true }
  )
    .select('-webhookSigningKey')
    .lean()
  if (!d) throw ApiError.notFound('设备不存在')

  // 通知 driver (PoC: 走 default noop; v2 真实厂商 SDK 联动)
  const driver = getDriver(d.vendor)
  await driver.setDoorState(d, mode, reason).catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[accessControl.setDoorState] driver call failed (non-fatal):`, e.message)
  })

  return d
}

async function recordHeartbeat({ deviceId }) {
  await AccessDevice.updateOne(
    { _id: deviceId },
    { $set: { lastHeartbeatAt: new Date() } }
  )
  return { ok: true }
}

// ═══════════════════════════════════════════════════════════════
// 2. FaceProfile
// ═══════════════════════════════════════════════════════════════

async function listFaceProfiles({ orgId, subjectType, studentId, userId, isActive, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (subjectType) filter.subjectType = subjectType
  if (typeof isActive === 'boolean') {
    filter.revokedAt = isActive ? null : { $ne: null }
  }
  if (studentId) {
    filter.subjectType = 'student'
    filter.subject = studentId
  }
  if (userId) {
    filter.subjectType = 'parent'
    filter.subject = userId
  }
  const [items, total] = await Promise.all([
    FaceProfile.find(filter)
      .populate('subject', 'name realName mobile')
      .populate('consentRecord', 'docKey version signedAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    FaceProfile.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function getFaceProfile({ orgId, id }) {
  const fp = await FaceProfile.findOne({ _id: id, org: orgId })
    .populate('subject', 'name realName mobile')
    .populate('consentRecord')
    .populate('enrolledBy', 'realName')
    .lean()
  if (!fp) throw ApiError.notFound('人脸档案不存在')
  return fp
}

/**
 * 录入人脸
 * @param {object} photoUpload 调用 storage.service.uploadOne 的结果 { id, url, ... }
 */
async function enrollFaceProfile({ orgId, operatorId, payload, photoUpload }) {
  const { subjectType, subjectId, consentRecordId, enrollmentQuality, deviceIds } = payload

  // 1. 验证同意书
  const consent = await UserConsent.findOne({
    _id: consentRecordId,
    org: orgId,
    subjectType,
    subject: subjectId,
    withdrawAt: null
  }).lean()
  if (!consent) {
    throw ApiError.unprocessable('未找到有效的电子同意书, 请先签署 face-consent-* 协议')
  }

  // 2. 验证主体存在 + 同 org
  await ensureSubjectInOrg({ orgId, subjectType, subjectId })

  // 3. 写 FaceProfile (partial unique 索引会挡重复 active 档案)
  try {
    const fp = await FaceProfile.create({
      org: orgId,
      subjectType,
      subject: subjectId,
      consentRecord: consentRecordId,
      enrollmentQuality: enrollmentQuality ?? null,
      deviceIds: Array.isArray(deviceIds) ? deviceIds : [],
      enrollmentPhoto: photoUpload ? photoUpload.id : null,
      enrolledBy: operatorId,
      syncStatus: 'pending'
    })
    return fp.toObject()
  } catch (e) {
    if (e && e.code === 11000) {
      throw ApiError.conflict('该主体已存在 active 人脸档案, 请先撤销旧档案再录新的')
    }
    throw e
  }
}

async function revokeFaceProfile({ orgId, id, operatorId, reason }) {
  const fp = await FaceProfile.findOne({ _id: id, org: orgId })
  if (!fp) throw ApiError.notFound('人脸档案不存在')
  if (fp.revokedAt) throw ApiError.badRequest('人脸档案已撤销')

  // 同步通知各设备本地白名单清理 (PoC: default noop)
  for (const deviceId of fp.deviceIds || []) {
    try {
      const device = await AccessDevice.findOne({ _id: deviceId, org: orgId }).lean()
      if (device) {
        const driver = getDriver(device.vendor)
        await driver.removeFaceProfile(device, fp)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[accessControl.revokeFaceProfile] driver.removeFaceProfile failed:`, e.message)
    }
  }

  fp.revokedAt = new Date()
  fp.revokedBy = operatorId
  fp.revokeReason = reason || ''
  fp.syncStatus = 'pending'
  await fp.save()
  return fp.toObject()
}

async function removableCheckFaceProfile({ orgId, id }) {
  // FaceProfile 用 soft revoke; 但 admin 想物理删历史时, 仍走 removableCheck
  return removable.check(orgId, [
    {
      model: AccessEvent,
      filter: { org: orgId, matchFaceProfile: id },
      label: '历史进出事件',
      hint: '该档案已被识别过 N 次, 不可物理删除; 如不再使用请走 /revoke 软撤销'
    }
  ])
}

// ═══════════════════════════════════════════════════════════════
// 3. AccessEvent (流水) + Webhook 核心
// ═══════════════════════════════════════════════════════════════

async function listAccessEvents({ orgId, device, subjectType, subject, eventType, direction, result, from, to, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (device) filter.device = device
  if (subjectType) filter.subjectType = subjectType
  if (subject) filter.subject = subject
  if (eventType) filter.eventType = eventType
  if (direction) filter.direction = direction
  if (result) filter.result = result
  if (from || to) {
    filter.recognizedAt = {}
    if (from) filter.recognizedAt.$gte = new Date(from)
    if (to) filter.recognizedAt.$lte = new Date(to)
  }
  const [items, total] = await Promise.all([
    AccessEvent.find(filter)
      .populate('device', 'name deviceSn location')
      .populate('subject', 'name realName')
      .populate('matchFaceProfile')
      .sort({ recognizedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    AccessEvent.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function getAccessEvent({ orgId, id }) {
  const e = await AccessEvent.findOne({ _id: id, org: orgId })
    .populate('device', 'name deviceSn location')
    .populate('subject', 'name realName')
    .populate('matchFaceProfile')
    .populate('snapshots.file')
    .lean()
  if (!e) throw ApiError.notFound('进出事件不存在')
  return e
}

async function getAccessEventStats({ orgId, from, to }) {
  const match = { org: orgId }
  if (from || to) {
    match.recognizedAt = {}
    if (from) match.recognizedAt.$gte = new Date(from)
    if (to) match.recognizedAt.$lte = new Date(to)
  }
  const agg = await AccessEvent.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$result',
        count: { $sum: 1 }
      }
    }
  ])
  const byResult = { allowed: 0, denied: 0, unknown: 0 }
  for (const r of agg) byResult[r._id] = r.count
  return { total: byResult.allowed + byResult.denied + byResult.unknown, ...byResult }
}

/**
 * Webhook 核心: 记录一条进出事件
 *
 * 调用栈: webhookAuth middleware (验签 + 注入 req.accessDevice) →
 *          controller.webhook → service.recordEvent
 *
 * 幂等: (org, device, deviceEventId) 复合唯一索引 → 重放直接 200 OK + deduplicated: true
 *
 * 强制规则 (CLAUDE.md §17.4):
 *  - livenessResult !== 'passed' → result='denied' (无论 subject 是否命中)
 *  - subject 未命中 → eventType='stranger' + result='denied'
 *  - 门锁维护中 (device.doorState.mode='maintenance') → result='denied'
 *  - 门锁常闭 → result='denied'
 */
async function recordEvent({ device, rawPayload, sourceIp }) {
  const driver = getDriver(device.vendor)
  const normalized = await driver.normalizeEvent(rawPayload)

  // 强制规则 1: 门锁状态
  if (device.doorState && ['maintenance', 'always_closed'].includes(device.doorState.mode)) {
    normalized.eventType = 'manual_override' // 物理上由人工放行
    // result 强制 denied 在下面覆盖
  }

  // 强制规则 2: 活体
  let result
  if (normalized.livenessResult !== LivenessResult.PASSED) {
    result = AccessResult.DENIED
    if (normalized.eventType === 'recognized') normalized.eventType = 'rejected'
  } else if (normalized.eventType === 'recognized') {
    // 1:N 命中 + 活体通过 → 检查该主体是否有 active 档案
    const matched = await findActiveFaceProfile({
      orgId: device.org,
      subjectType: normalized.subjectType,
      subject: normalized.subject
    })
    if (!matched) {
      // 设备报识别成功但服务端查不到 active 档案 → 降级为 stranger
      normalized.eventType = 'stranger'
      normalized.subjectType = null
      normalized.subject = null
      result = AccessResult.DENIED
    } else {
      normalized.matchFaceProfile = matched._id
      result = AccessResult.ALLOWED
    }
  } else if (normalized.eventType === 'stranger') {
    result = AccessResult.DENIED
  } else {
    // rejected / manual_override → 维持设备报告
    result = normalized.eventType === 'rejected' ? AccessResult.DENIED : AccessResult.UNKNOWN
  }

  // 强制规则 3: 门锁状态覆盖
  if (device.doorState && ['maintenance', 'always_closed'].includes(device.doorState.mode)) {
    result = AccessResult.DENIED
  }

  // 抓拍图 → File (走 storage service)
  const snapshots = []
  if (normalized.snapshotBuffer) {
    const isStranger = normalized.eventType === 'stranger'
    const file = await uploadSnapshotFile({
      orgId: device.org,
      uploaderId: device.registeredBy, // 用设备注册人作为"上传者"
      buffer: normalized.snapshotBuffer,
      mime: normalized.snapshotMime || 'image/jpeg',
      kind: isStranger ? SnapshotKind.STRANGER : SnapshotKind.AUTHORIZED
    })
    snapshots.push({
      kind: isStranger ? SnapshotKind.STRANGER : SnapshotKind.AUTHORIZED,
      file: file._id,
      retentionUntil: new Date(Date.now() + 30 * 24 * 3600 * 1000) // 30 天
    })
  }

  // 时钟偏移
  const recognizedAt = new Date()
  const clockSkewMs = normalized.deviceTimestamp
    ? recognizedAt.getTime() - normalized.deviceTimestamp.getTime()
    : null

  // 写 AccessEvent (复合唯一索引保证幂等)
  try {
    const ev = await AccessEvent.create({
      org: device.org,
      device: device._id,
      deviceEventId: normalized.deviceEventId,
      subjectType: normalized.subjectType,
      subject: normalized.subject,
      eventType: normalized.eventType,
      direction: normalized.direction,
      result,
      livenessResult: normalized.livenessResult,
      similarity: normalized.similarity,
      matchFaceProfile: normalized.matchFaceProfile,
      recognizedAt,
      deviceTimestamp: normalized.deviceTimestamp,
      clockSkewMs,
      snapshots,
      sourceIp: sourceIp || '',
      meta: { subjectMatchedBy: normalized.subjectMatchedBy }
    })
    return { event: ev.toObject(), deduplicated: false }
  } catch (e) {
    if (e && e.code === 11000) {
      // 重复事件 → 幂等返回
      return { deduplicated: true }
    }
    throw e
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. AuthorizedPickup
// ═══════════════════════════════════════════════════════════════

async function listPickups({ orgId, student, pickupUser, isActive, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (student) filter.student = student
  if (pickupUser) filter.pickupUser = pickupUser
  if (typeof isActive === 'boolean') {
    filter.revokedAt = isActive ? null : { $ne: null }
  }
  const [items, total] = await Promise.all([
    AuthorizedPickup.find(filter)
      .populate('student', 'name')
      .populate('pickupUser', 'realName mobile')
      .populate('faceProfile')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    AuthorizedPickup.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function getPickup({ orgId, id }) {
  const p = await AuthorizedPickup.findOne({ _id: id, org: orgId })
    .populate('student', 'name')
    .populate('pickupUser', 'realName mobile')
    .populate('faceProfile')
    .lean()
  if (!p) throw ApiError.notFound('接送授权不存在')
  return p
}

async function createPickup({ orgId, operatorId, payload }) {
  const { student, pickupPersonType, pickupUser, faceProfile } = payload

  // 1. 校验 student 同 org
  const stu = await Student.findOne({ _id: student, org: orgId }).lean()
  if (!stu) throw ApiError.badRequest('学员不存在或不属于本机构')

  // 2. parent 类型: pickupUser 必填, 同步姓名/电话防脏数据
  if (pickupPersonType === 'parent') {
    if (!pickupUser) throw ApiError.badRequest('parent 类型必须传 pickupUser')
    const u = await User.findOne({ _id: pickupUser, isActive: true })
      .select('realName mobile')
      .lean()
    if (!u) throw ApiError.badRequest('pickupUser 用户不存在或已停用')
    // 校验 user 在本机构
    const rel = await UserOrgRel.findOne({ user: pickupUser, org: orgId }).lean()
    if (!rel) throw ApiError.badRequest('pickupUser 不属于本机构')
    // 同步姓名/电话
    payload.pickupName = u.realName || ''
    payload.pickupPhone = u.mobile || ''
  }

  // 3. 第三方: name/phone 必填
  if (pickupPersonType === 'authorized_third_party') {
    if (!payload.pickupName || !payload.pickupPhone) {
      throw ApiError.badRequest('authorized_third_party 类型必须传 pickupName 和 pickupPhone')
    }
  }

  // 4. 校验 faceProfile (parent 必填, 第三方可选)
  if (pickupPersonType === 'parent' && !faceProfile) {
    throw ApiError.badRequest('parent 类型必须关联 faceProfile (接送家长须先录入人脸)')
  }
  if (faceProfile) {
    const fp = await FaceProfile.findOne({ _id: faceProfile, org: orgId, revokedAt: null }).lean()
    if (!fp) throw ApiError.badRequest('faceProfile 不存在或已撤销')
  }

  // 5. validUntil > validFrom
  if (new Date(payload.validUntil) <= new Date(payload.validFrom)) {
    throw ApiError.badRequest('validUntil 必须晚于 validFrom')
  }

  const doc = await AuthorizedPickup.create({
    ...payload,
    org: orgId,
    createdBy: operatorId
  })
  return doc.toObject()
}

async function updatePickup({ orgId, id, payload }) {
  const p = await AuthorizedPickup.findOne({ _id: id, org: orgId })
  if (!p) throw ApiError.notFound('接送授权不存在')
  if (p.revokedAt) throw ApiError.badRequest('已撤销的授权不可编辑')

  // 如果传了 validFrom/validUntil, 校验
  const newFrom = payload.validFrom ? new Date(payload.validFrom) : p.validFrom
  const newUntil = payload.validUntil ? new Date(payload.validUntil) : p.validUntil
  if (newUntil <= newFrom) throw ApiError.badRequest('validUntil 必须晚于 validFrom')

  // 同步 faceProfile 校验
  if (payload.faceProfile) {
    const fp = await FaceProfile.findOne({ _id: payload.faceProfile, org: orgId, revokedAt: null }).lean()
    if (!fp) throw ApiError.badRequest('faceProfile 不存在或已撤销')
  }

  Object.assign(p, payload)
  await p.save()
  return p.toObject()
}

async function revokePickup({ orgId, id, operatorId, reason }) {
  const p = await AuthorizedPickup.findOne({ _id: id, org: orgId })
  if (!p) throw ApiError.notFound('接送授权不存在')
  if (p.revokedAt) throw ApiError.badRequest('已撤销')
  p.revokedAt = new Date()
  p.revokedBy = operatorId
  p.revokeReason = reason || ''
  await p.save()
  return p.toObject()
}

// ═══════════════════════════════════════════════════════════════
// 5. FaceConsent (复用 UserConsent)
// ═══════════════════════════════════════════════════════════════

/**
 * 取当前生效的协议模板 (走 LegalDoc 字典, model='org' + key=face-consent-*)
 */
async function getConsentTemplate({ orgId, docKey }) {
  if (!['face-consent-student', 'face-consent-pickup', 'face-consent-staff'].includes(docKey)) {
    throw ApiError.badRequest('docKey 必须是 face-consent-*')
  }
  const doc = await LegalDoc.findOne({ org: orgId, key: docKey, isActive: true })
    .sort({ createdAt: -1 })
    .lean()
  if (!doc) {
    // 兜底: 返回空模板, 提示 admin 还没配置
    return { docKey, title: '人脸采集同意书', contentHtml: '<p>机构尚未配置本协议, 请联系管理员</p>', version: 'v1.0' }
  }
  return {
    docKey,
    title: doc.title,
    contentHtml: doc.contentHtml,
    version: doc.version
  }
}

/**
 * 列出当前用户的所有有效同意书 (UserConsent.withdrawAt=null)
 */
async function listMyConsents({ userId, orgId }) {
  const items = await UserConsent.find({
    user: userId,
    org: orgId,
    docKey: { $in: ['face-consent-student', 'face-consent-pickup', 'face-consent-staff'] },
    withdrawAt: null
  })
    .sort({ createdAt: -1 })
    .lean()
  return { items }
}

/**
 * 签署电子同意书
 *
 * @param {object} payload - { docKey, subjectType, subject, version?, agreed }
 * @param {object} context - { userId, orgId, ip, userAgent }
 */
async function signConsent({ payload, context }) {
  if (!payload.agreed) throw ApiError.badRequest('必须同意协议 (agreed=true)')

  // 1. 取协议模板
  const template = await getConsentTemplate({ orgId: context.orgId, docKey: payload.docKey })

  // 2. 校验主体存在
  await ensureSubjectInOrg({
    orgId: context.orgId,
    subjectType: payload.subjectType,
    subjectId: payload.subject
  })

  // 3. 写 UserConsent (append-only, partial unique 保证幂等)
  try {
    const consent = await UserConsent.create({
      user: context.userId,
      org: context.orgId,
      docKey: payload.docKey,
      docType: 'org',
      version: payload.version || template.version,
      title: template.title,
      subjectType: payload.subjectType,
      subject: payload.subject,
      ip: context.ip || '',
      userAgent: context.userAgent || ''
    })
    return consent.toObject()
  } catch (e) {
    if (e && e.code === 11000) {
      throw ApiError.conflict('您已签署过该协议当前版本, 无需重复签署')
    }
    throw e
  }
}

/**
 * 撤回同意书 → 级联写 FaceProfile.revokedAt
 */
async function withdrawConsent({ orgId, consentId, userId, reason, ip }) {
  const consent = await UserConsent.findOne({ _id: consentId, org: orgId, user: userId })
  if (!consent) throw ApiError.notFound('同意书不存在')
  if (consent.withdrawAt) throw ApiError.badRequest('该同意书已撤回')

  consent.withdrawAt = new Date()
  consent.withdrawBy = userId
  consent.withdrawIp = ip || ''
  consent.revokeReason = reason || ''
  await consent.save()

  // 级联: 把引用本 consent 的 active FaceProfile 全部撤销
  await FaceProfile.updateMany(
    { org: orgId, consentRecord: consent._id, revokedAt: null },
    {
      $set: {
        revokedAt: new Date(),
        revokedBy: userId,
        revokeReason: `consent_withdrawn: ${reason || ''}`.trim()
      }
    }
  )

  return consent.toObject()
}

// ═══════════════════════════════════════════════════════════════
// 6. Client 端 (家长小程序)
// ═══════════════════════════════════════════════════════════════

/**
 * 家长录入孩子人脸
 * 关键: 校验 req.user.id 在 active student 的 guardians 数组里
 */
async function clientEnrollMyChild({ orgId, userId, activeStudentId, payload, photoUpload }) {
  // 校验 active student 在本 org + 是当前 user 的孩子
  const student = await Student.findOne({ _id: activeStudentId, org: orgId })
    .select('guardians guardianUser')
    .lean()
  if (!student) throw ApiError.badRequest('当前 active 学员不存在')
  const isGuardian = (student.guardians || []).map(String).includes(String(userId)) ||
    String(student.guardianUser) === String(userId)
  if (!isGuardian) throw ApiError.forbidden('您不是该学员的监护人, 无权录入人脸')

  return enrollFaceProfile({
    orgId,
    operatorId: userId,
    payload: {
      subjectType: 'student',
      subjectId: activeStudentId,
      ...payload
    },
    photoUpload
  })
}

/**
 * 家长录入自己人脸 (接送家长)
 */
async function clientEnrollSelf({ orgId, userId, payload, photoUpload }) {
  return enrollFaceProfile({
    orgId,
    operatorId: userId,
    payload: {
      subjectType: 'parent',
      subjectId: userId,
      ...payload
    },
    photoUpload
  })
}

async function clientListPickups({ orgId, userId, activeStudentId }) {
  return listPickups({ orgId, student: activeStudentId })
}

async function clientCreatePickup({ orgId, userId, activeStudentId, payload }) {
  return createPickup({
    orgId,
    operatorId: userId,
    payload: { ...payload, student: activeStudentId }
  })
}

async function clientRevokePickup({ orgId, userId, id, reason }) {
  // 校验当前 user 是该 pickup 的创建人 OR active student 的监护人
  const p = await AuthorizedPickup.findOne({ _id: id, org: orgId }).lean()
  if (!p) throw ApiError.notFound('接送授权不存在')
  const isOwner = String(p.createdBy) === String(userId)
  if (!isOwner) {
    const stu = await Student.findOne({ _id: p.student, org: orgId })
      .select('guardians guardianUser')
      .lean()
    const isGuardian = stu && (stu.guardians || []).map(String).includes(String(userId))
    if (!isGuardian) throw ApiError.forbidden('无权撤销该授权')
  }
  return revokePickup({ orgId, id, operatorId: userId, reason })
}

async function clientListMyAccessEvents({ orgId, userId, page, pageSize }) {
  // 家长作为接送人时的所有识别事件 (subjectType=parent, subject=userId)
  return listAccessEvents({
    orgId,
    subjectType: 'parent',
    subject: userId,
    page,
    pageSize
  })
}

async function clientListMyChildAccessEvents({ orgId, userId, activeStudentId, page, pageSize }) {
  // 校验 active student 归属
  const student = await Student.findOne({ _id: activeStudentId, org: orgId })
    .select('guardians guardianUser')
    .lean()
  if (!student) throw ApiError.badRequest('当前 active 学员不存在')
  const isGuardian = (student.guardians || []).map(String).includes(String(userId)) ||
    String(student.guardianUser) === String(userId)
  if (!isGuardian) throw ApiError.forbidden('您不是该学员的监护人, 无权查看')

  return listAccessEvents({
    orgId,
    subjectType: 'student',
    subject: activeStudentId,
    page,
    pageSize
  })
}

// ═══════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════

async function ensureSubjectInOrg({ orgId, subjectType, subjectId }) {
  let Model
  if (subjectType === 'student') Model = Student
  else if (subjectType === 'parent') Model = User
  else if (subjectType === 'authorized_pickup') Model = AuthorizedPickup
  else throw ApiError.badRequest('subjectType 非法')

  let filter = { _id: subjectId }
  if (subjectType === 'parent') {
    // 校验 user 在本机构
    const rel = await UserOrgRel.findOne({ user: subjectId, org: orgId }).lean()
    if (!rel) throw ApiError.badRequest('pickupUser 不属于本机构')
  } else {
    filter.org = orgId
  }
  const exists = await Model.findOne(filter).select('_id').lean()
  if (!exists) throw ApiError.badRequest(`${subjectType} 不存在`)
  return exists
}

async function findActiveFaceProfile({ orgId, subjectType, subject }) {
  if (!subjectType || !subject) return null
  if (!mongoose.isValidObjectId(subject)) return null
  return FaceProfile.findOne({
    org: orgId,
    subjectType,
    subject,
    revokedAt: null
  })
    .select('_id syncStatus deviceIds')
    .lean()
}

async function uploadSnapshotFile({ orgId, uploaderId, buffer, mime, kind }) {
  // PoC: 直接写 File 文档 (local driver 默认)
  // 真实场景: 走 storage.service.uploadOne, 但 storage.service 依赖 express req.file
  // 这里写一个直插版, 复用 storage 的 driver.putObject
  const { getDriver: getStorageDriver, buildKey } = require('@modules/storage/drivers')
  const driver = getStorageDriver('local') // PoC: 强制 local (CLAUDE.md §17.5 强约束: 人脸照片不得上公有云)
  const now = new Date()
  const yyyymm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const yyyymmdd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const uuid = crypto.randomBytes(8).toString('hex')
  const ext = mime.split('/')[1] || 'jpg'
  const key = buildKey
    ? buildKey({ scope: kind === SnapshotKind.STRANGER ? 'faceAccessStrangerSnapshot' : 'faceAccessSnapshot', date: yyyymm, dateCompact: yyyymmdd, uuid, ext })
    : `faceAccess/${yyyymm}/${yyyymmdd}/${uuid}.${ext}`

  const driverRes = await driver.putObject({ key, buffer, mime })
  const scope = kind === SnapshotKind.STRANGER ? 'faceAccessStrangerSnapshot' : 'faceAccessSnapshot'
  const file = await File.create({
    org: orgId,
    scope,
    uploader: uploaderId,
    driver: 'local',
    key: driverRes.key || key,
    url: driverRes.url || `/uploads/${driverRes.key || key}`,
    mime,
    size: buffer.length,
    refs: []
  })
  return file.toObject()
}

module.exports = {
  // device
  listDevices, getDevice, createDevice, updateDevice, removeDevice, removableCheckDevice,
  regenerateSecret, setDoorState, recordHeartbeat,
  // face profile
  listFaceProfiles, getFaceProfile, enrollFaceProfile, revokeFaceProfile, removableCheckFaceProfile,
  // access event
  listAccessEvents, getAccessEvent, getAccessEventStats, recordEvent,
  // pickup
  listPickups, getPickup, createPickup, updatePickup, revokePickup,
  // consent
  getConsentTemplate, listMyConsents, signConsent, withdrawConsent,
  // client
  clientEnrollMyChild, clientEnrollSelf,
  clientListPickups, clientCreatePickup, clientRevokePickup,
  clientListMyAccessEvents, clientListMyChildAccessEvents
}
