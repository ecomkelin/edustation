'use strict'

const AccessDeviceDriver = require('./base')

/**
 * 海康威视「深眸」AI 摄像头 driver (PoC stub)
 *
 * 海康 ISAPI 协议与汉王/熵基差异较大, PoC 阶段不实现; 仅留子类骨架。
 * 待 v2 实现 normalizeEvent (解析 ISAPI 事件 XML/JSON)。
 */
class HikvisionDriver extends AccessDeviceDriver {
  async normalizeEvent(rawPayload) {
    throw new Error('HikvisionDriver.normalizeEvent 尚未实现 (PoC stub, v2 接入)')
  }
}

module.exports = HikvisionDriver
