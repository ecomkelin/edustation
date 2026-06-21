'use strict'

const { Schema, model } = require('mongoose')
const { ACCESS_DEVICE_VENDORS, DOOR_STATE_MODES } = require('@shared/enums')

/**
 * 门禁设备 (AccessDevice)
 *
 * 一个机构可注册 N 台门禁一体机 (前门/后门/侧门/教室入口 等)。
 * 设备本地跑人脸算法, 通过 webhook 推 AccessEvent 到后端。
 *
 * 关键设计 (2026-06 立项):
 *  - org + deviceSn 复合唯一: 同一机构内 SN 唯一, 跨机构允许撞号 (一台机器被卖多机构)
 *  - webhookSigningKey: HMAC 原始密钥 (不哈希存, regen 时整段重置)
 *  - doorState: 门锁状态子文档 (正常/常开/常闭/维护), 远程可切
 *  - 物理删除走 requirePlatformPassword + removable-check (与 org/position 同款)
 *  - lastHeartbeatAt: 设备心跳, > 5 分钟无心跳 Admin 看板标红
 */
const DoorStateSchema = new Schema(
  {
    mode: { type: String, enum: DOOR_STATE_MODES, default: 'normal' },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    changedAt: { type: Date, default: null },
    reason: { type: String, default: '' }
  },
  { _id: false }
)

const AccessDeviceSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    vendor: { type: String, enum: ACCESS_DEVICE_VENDORS, required: true, default: 'hanwang' },
    vendorModel: { type: String, default: '', trim: true, maxlength: 100 },
    // 设备序列号: 同一 org 内唯一
    deviceSn: { type: String, required: true, trim: true, maxlength: 100 },
    ipAddress: { type: String, default: '', trim: true, maxlength: 64 },
    macAddress: { type: String, default: '', trim: true, maxlength: 64 },
    firmwareVersion: { type: String, default: '', trim: true, maxlength: 64 },
    location: { type: String, default: '', trim: true, maxlength: 100 },
    // HMAC 原始密钥 (不哈希存, web 端要拿到原始 key 算签名)
    webhookSigningKey: { type: String, required: true, minlength: 8, maxlength: 128 },
    // 设备能力子集: face / card / qr / body_temp
    capabilities: [{ type: String }],
    // 门锁状态 (PoC 远程切换不实现硬件联动, 仅改 mode 字段记录)
    doorState: { type: DoorStateSchema, default: () => ({ mode: 'normal', reason: '' }) },
    isActive: { type: Boolean, default: true, index: true },
    // 心跳时间 (设备主动 POST /heartbeat 更新)
    lastHeartbeatAt: { type: Date, default: null },
    // 注册人
    registeredBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'access_devices' }
)

// 同一机构内 SN 唯一 (跨机构允许撞号)
AccessDeviceSchema.index({ org: 1, deviceSn: 1 }, { unique: true })
// 按机构 + 启用状态过滤
AccessDeviceSchema.index({ org: 1, isActive: 1 })
// 心跳告警查询
AccessDeviceSchema.index({ org: 1, lastHeartbeatAt: 1 })

module.exports = model('AccessDevice', AccessDeviceSchema)
