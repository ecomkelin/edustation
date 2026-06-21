'use strict'

const AccessDeviceDriver = require('./base')
const { LivenessResult, AccessDirection } = require('@shared/enums')

/**
 * 汉王 / 熵基 7 寸一体机 通用协议 driver
 *
 * 覆盖设备: 熵基 F7S / 汉王 HW-D8 / 飞鱼 K20 等通用协议机型
 * PoC 第一版: 解析 HTTP webhook 推送的事件, 不实现设备反向调用 (远程开门/同步人脸)
 *
 * 厂商典型回调 body 格式 (参考):
 *   {
 *     "recordId": "evt-2026-06-21-001",        // 设备原生事件 ID (用作 deviceEventId)
 *     "type": "face",                            // 'face'|'card'|'qr'|'manual'
 *     "result": "success"|"fail",
 *     "direction": "in"|"out",                   // 部分设备字段名 'inout'
 *     "similarity": 0.92,                        // 0-1
 *     "liveness": "pass"|"fail"|"none",
 *     "snapshot": "<base64 jpg>",                // 抓拍图 base64
 *     "userId": "uuid-or-our-id",                // 1:N 命中后设备返回的 userId (我们录入时同步给设备的)
 *     "userType": "student"|"parent"|"pickup"|"stranger",
 *     "timestamp": 1718900000,                   // unix sec
 *     "deviceSn": "HW-2024-001"                  // 冗余, 服务端以 path 为准
 *   }
 *
 * 字段名兼容:
 *   - recordId / eventId / event_id → deviceEventId
 *   - inout / direction / pass_type → direction
 *   - liveness / liveResult → livenessResult
 *   - snapshot / image / pic → snapshotBuffer (base64 解码)
 */
class HanwangDriver extends AccessDeviceDriver {
  async normalizeEvent(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object') {
      throw new Error('webhook payload 必须为对象')
    }
    const p = rawPayload

    // 1. deviceEventId (防重放唯一键)
    const deviceEventId =
      String(p.recordId || p.eventId || p.event_id || '').trim()
    if (!deviceEventId) {
      throw new Error('webhook payload 缺少 recordId / eventId')
    }

    // 2. 主体类型 + ID
    const userTypeRaw = String(p.userType || p.user_type || '').toLowerCase()
    const userId = p.userId || p.user_id || null
    let subjectType = null
    let subject = null
    if (userId) {
      if (userTypeRaw === 'student') subjectType = 'student'
      else if (userTypeRaw === 'parent') subjectType = 'parent'
      else if (userTypeRaw === 'pickup' || userTypeRaw === 'authorized_pickup') {
        subjectType = 'authorized_pickup'
      } else {
        subjectType = null // 未知类型按陌生人处理
      }
      subject = String(userId)
    }

    // 3. eventType
    const resultRaw = String(p.result || '').toLowerCase()
    const typeRaw = String(p.type || '').toLowerCase()
    let eventType
    if (typeRaw === 'manual' || typeRaw === 'manual_override') {
      eventType = 'manual_override'
    } else if (!subject) {
      eventType = 'stranger'
    } else if (resultRaw === 'success' || resultRaw === 'pass') {
      eventType = 'recognized'
    } else {
      eventType = 'rejected'
    }

    // 4. direction
    const dirRaw = String(p.direction || p.inout || '').toLowerCase()
    const direction =
      dirRaw === 'in' || dirRaw === 'enter'
        ? AccessDirection.IN
        : dirRaw === 'out' || dirRaw === 'exit'
          ? AccessDirection.OUT
          : AccessDirection.UNKNOWN

    // 5. liveness
    const liveRaw = String(p.liveness || p.liveResult || p.live || 'none').toLowerCase()
    const livenessResult =
      liveRaw === 'pass' || liveRaw === 'passed'
        ? LivenessResult.PASSED
        : liveRaw === 'fail' || liveRaw === 'failed'
          ? LivenessResult.FAILED
          : LivenessResult.NOT_ATTEMPTED

    // 6. similarity
    let similarity = null
    if (p.similarity != null) {
      const s = Number(p.similarity)
      if (Number.isFinite(s)) similarity = Math.max(0, Math.min(1, s))
    }

    // 7. snapshot (base64 → Buffer)
    let snapshotBuffer = null
    let snapshotMime = null
    if (p.snapshot || p.image || p.pic) {
      const b64 = String(p.snapshot || p.image || p.pic)
      // 部分厂商带 data:image/jpeg;base64,xxx 前缀
      const m = b64.match(/^data:([^;]+);base64,(.*)$/)
      if (m) {
        snapshotMime = m[1]
        snapshotBuffer = Buffer.from(m[2], 'base64')
      } else {
        snapshotMime = 'image/jpeg'
        snapshotBuffer = Buffer.from(b64, 'base64')
      }
    }

    // 8. deviceTimestamp
    let deviceTimestamp = null
    if (p.timestamp) {
      const ts = Number(p.timestamp)
      if (Number.isFinite(ts) && ts > 0) {
        deviceTimestamp = new Date(ts * 1000)
      }
    }

    return {
      deviceEventId,
      subjectType,
      subject,
      subjectMatchedBy: subject ? 'sn' : null,
      eventType,
      direction,
      livenessResult,
      similarity,
      snapshotBuffer,
      snapshotMime,
      deviceTimestamp
    }
  }
}

module.exports = HanwangDriver
