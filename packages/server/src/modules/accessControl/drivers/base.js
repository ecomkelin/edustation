'use strict'

/**
 * 门禁设备驱动抽象基类 (AccessDeviceDriver)
 *
 * 仿 storage/drivers 模式: 每个厂商一种 driver, 通过 factory 按 vendor 取。
 * 子类必须实现 normalizeEvent; 其他方法 (syncFaceProfile / removeFaceProfile /
 * setDoorState / parseHeartbeat) 有 default noop, 子类按需 override。
 *
 * 关键设计 (2026-06 立项):
 *  - normalizeEvent 标准化 → { deviceEventId, subjectType?, subject?, eventType,
 *    direction, livenessResult, similarity?, snapshotBuffer?, deviceTimestamp }
 *  - snapshotBuffer: 抓拍图 buffer (string base64 / Buffer); 由 controller 调
 *    storage.service.uploadOne 落 File, scope=faceAccessSnapshot / faceAccessStrangerSnapshot
 */
class AccessDeviceDriver {
  /**
   * 厂商原始回调 payload → AccessEvent 入参
   * @param {object} rawPayload 一体机 POST 的 body (已 JSON.parse)
   * @returns {Promise<{
   *   deviceEventId: string,             // 必填, 用于防重放唯一索引
   *   subjectType: string|null,          // 'student'|'parent'|'authorized_pickup'|null
   *   subject: string|null,              // 主体 ObjectId 字符串; null = 陌生人
   *   subjectMatchedBy: 'sn'|'name'|'card'|null,  // 设备怎么识别的 (审计)
   *   eventType: string,                 // 'recognized'|'rejected'|'stranger'|'manual_override'
   *   direction: 'in'|'out'|'unknown',
   *   livenessResult: 'passed'|'failed'|'not_attempted',
   *   similarity: number|null,           // 0-1
   *   snapshotBuffer: Buffer|null,       // 抓拍图; null = 设备未推图
   *   snapshotMime: string|null,         // 'image/jpeg' 等
   *   deviceTimestamp: Date|null
   * }>}
   */
  async normalizeEvent(rawPayload) {
    throw new Error('AccessDeviceDriver.normalizeEvent must be implemented by subclass')
  }

  /**
   * 把人脸档案同步到设备本地白名单 (断网时设备能离线识别)
   * default: noop (PoC: 仅在后端 DB 记录, 设备本地白名单依赖一体机自己同步策略)
   */
  async syncFaceProfile(device, profile) {
    return { ok: true, noop: true }
  }

  /**
   * 从设备本地白名单删除人脸档案
   * default: noop
   */
  async removeFaceProfile(device, profile) {
    return { ok: true, noop: true }
  }

  /**
   * 远程切换门锁状态
   * default: noop (PoC: 仅改 AccessDevice.doorState.mode, 硬件联动由一体机自身逻辑)
   */
  async setDoorState(device, mode, reason) {
    return { ok: true, noop: true }
  }

  /**
   * 解析心跳 payload → { lastHeartbeatAt, meta? }
   * default: { lastHeartbeatAt: new Date() }
   */
  parseHeartbeat(rawPayload) {
    return { lastHeartbeatAt: new Date() }
  }
}

module.exports = AccessDeviceDriver
