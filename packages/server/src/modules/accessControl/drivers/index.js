'use strict'

/**
 * 门禁设备 driver 工厂
 *
 * 按 vendor 字段取对应 driver 实例; 兜底走 'hanwang' (其协议相对通用,
 * 'custom' 类型厂商可配置成走 hanwang driver + 后处理)。
 */
const HanwangDriver = require('./hanwang')
const HikvisionDriver = require('./hikvision')
const DahuaDriver = require('./dahua')
const { AccessDeviceVendor } = require('@shared/enums')

const drivers = {
  [AccessDeviceVendor.HANWANG]: new HanwangDriver(),
  [AccessDeviceVendor.CUSTOM]: new HanwangDriver(), // 兜底
  [AccessDeviceVendor.HIKVISION]: new HikvisionDriver(),
  [AccessDeviceVendor.DAHUA]: new DahuaDriver(),
  [AccessDeviceVendor.ZKTECO]: new HanwangDriver() // PoC: ZKTECO 协议也走通用解析
}

function getDriver(vendor) {
  return drivers[vendor] || drivers[AccessDeviceVendor.HANWANG]
}

module.exports = { getDriver }
