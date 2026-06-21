'use strict'

const AccessDeviceDriver = require('./base')

/**
 * 大华「灵犀」AI 摄像头 driver (PoC stub)
 *
 * 大华 HTTP API 与海康/汉王差异较大, PoC 阶段不实现; 仅留子类骨架。
 * 待 v2 实现 normalizeEvent。
 */
class DahuaDriver extends AccessDeviceDriver {
  async normalizeEvent(rawPayload) {
    throw new Error('DahuaDriver.normalizeEvent 尚未实现 (PoC stub, v2 接入)')
  }
}

module.exports = DahuaDriver
