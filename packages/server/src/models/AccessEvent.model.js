'use strict'

const { Schema, model } = require('mongoose')
const {
  ACCESS_EVENT_TYPES,
  ACCESS_DIRECTIONS,
  ACCESS_RESULTS,
  LIVENESS_RESULTS,
  SNAPSHOT_KINDS
} = require('@shared/enums')

/**
 * 进出事件流水 (AccessEvent)
 *
 * 一体机每次识别结果 (无论成功/失败/陌生人) 都推一条 webhook 过来, 落在这里。
 *
 * 关键设计 (2026-06 立项):
 *  - org 在 webhookAuth 中间件由 deviceSn 反查锁定, **不读 body 里的 org** (防越权)
 *  - (org, device, deviceEventId) 复合唯一 → 设备重发/webhook 重放 全部走 Mongo 唯一冲突
 *    自动去重, 设备拿到 200 OK + deduplicated: true
 *  - 强制规则: livenessResult !== 'passed' → result='denied' (防止打印照片攻击)
 *  - clockSkewMs = recognizedAt - deviceTimestamp, 绝对值 > 60000 报警 (设备 RTC 没电)
 *  - snapshots 数组: 同时存授权人 + 陌生人抓拍, 独立 retentionUntil (30 天后清)
 *  - subjectType/subject 为 null = 陌生人 (1:N 未命中)
 */
const SnapshotSchema = new Schema(
  {
    // 'authorized' = 识别通过; 'stranger' = 陌生人
    kind: { type: String, enum: SNAPSHOT_KINDS, required: true },
    // 抓拍图 File 引用 (scope=faceAccessSnapshot 或 faceAccessStrangerSnapshot)
    file: { type: Schema.Types.ObjectId, ref: 'File', required: true },
    // 保留到期 (默认 30 天, 定时任务清, 见 compliance.js cleanupExpiredSnapshots)
    retentionUntil: { type: Date, required: true }
  },
  { _id: false }
)

const AccessEventSchema = new Schema(
  {
    org: { type: Schema.Types.ObjectId, ref: 'Org', required: true, index: true },
    // 设备 (webhookAuth 中间件反查 deviceSn 注入, 不信 body)
    device: { type: Schema.Types.ObjectId, ref: 'AccessDevice', required: true, index: true },
    // 设备原生事件 ID (recordId / event_id), 复合唯一防重放
    deviceEventId: { type: String, required: true, trim: true, maxlength: 128 },
    // 主体 (null = 陌生人, 1:N 未命中)
    subjectType: {
      type: String,
      enum: ['student', 'parent', 'authorized_pickup', null],
      default: null
    },
    subject: { type: Schema.Types.ObjectId, refPath: 'subjectType', default: null },
    // 事件类型
    eventType: { type: String, enum: ACCESS_EVENT_TYPES, required: true, index: true },
    direction: { type: String, enum: ACCESS_DIRECTIONS, default: 'unknown' },
    // 进出结果 (service 层强制: livenessResult !== 'passed' → result='denied')
    result: { type: String, enum: ACCESS_RESULTS, required: true, index: true },
    livenessResult: { type: String, enum: LIVENESS_RESULTS, default: 'not_attempted' },
    similarity: { type: Number, min: 0, max: 1, default: null },
    // 命中的 FaceProfile (null = 陌生人)
    matchFaceProfile: { type: Schema.Types.ObjectId, ref: 'FaceProfile', default: null },
    // 服务端接收时间 (唯一可信时间)
    recognizedAt: { type: Date, required: true, index: true },
    // 设备时间 (不可信, 仅作参考)
    deviceTimestamp: { type: Date, default: null },
    // 时钟偏移 (毫秒) = recognizedAt - deviceTimestamp, 监控设备 RTC
    clockSkewMs: { type: Number, default: null },
    // 抓拍图数组 (PoC 一般 1 张; 部分设备同时推授权人 + 陌生人)
    snapshots: [SnapshotSchema],
    // 触发 webhook 的源 IP (供 HMAC 审计)
    sourceIp: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true, collection: 'access_events' }
)

// 复合唯一: 同一设备的同一原生事件 ID 只能落 1 次 (webhook 重放保护)
AccessEventSchema.index(
  { org: 1, device: 1, deviceEventId: 1 },
  { unique: true }
)
// 流水时序查询
AccessEventSchema.index({ org: 1, recognizedAt: -1 })
// 单设备时间窗查询 (告警/反查)
AccessEventSchema.index({ org: 1, device: 1, recognizedAt: -1 })
// 主体行为回溯 (学员/家长某段时间所有进出)
AccessEventSchema.index({ org: 1, subjectType: 1, subject: 1, recognizedAt: -1 })
// 看板统计
AccessEventSchema.index({ org: 1, result: 1, recognizedAt: -1 })

module.exports = model('AccessEvent', AccessEventSchema)
