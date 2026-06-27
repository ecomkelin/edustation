'use strict'

const { Schema, model } = require('mongoose')

/**
 * 审计日志 (AuditLog, 2026-06-27 立项)
 *
 * 单一 collection, 异步中间件 auditTrail (res.on('finish') + setImmediate) 写入.
 * 仅平台超管可读; 业务侧不引用此表, 业务行为不能依赖审计的成功.
 *
 * 字段语义:
 *   - method/url:   HTTP method + path (without query string)
 *   - query/params/body: 请求入参, body 截断 2KB + 脱敏
 *   - statusCode:   res.statusCode 快照
 *   - durationMs:   中间件开始到 finish 的耗时
 *   - actor:        行为人 (ref User); 包含 name/mobile 快照 (改名/换号不影响历史)
 *   - org:          所属机构 (ref Org); 包含 name 快照
 *   - ip/userAgent: 入站 IP / UA
 *   - requestId:    关联 req.id (查日志链)
 *
 * 物理删除: 业务不删; cron 可定期清理 (开发期可手动 db.collection.drop()).
 * 保留期: 默认 180 天 (retentionUntil 字段 + TTL 索引).
 *   - 创建时 retentionUntil = createdAt + 180d
 *   - TTL 索引 { retentionUntil: 1 } expireAfterSeconds: 0 到期自动删
 *
 * 权限: 不引入 audit.read 权限码, 仅平台超管 (requirePlatformAdmin 硬门).
 *   决策 2026-06-27: 用户原话"审查日志 超管可见".
 */

const SENSITIVE_KEYS = [
  'password', 'oldPassword', 'newPassword', 'confirmPassword',
  'token', 'refreshToken', 'accessToken', 'authorization',
  'secret', 'apiKey', 'privateKey'
]

/**
 * 递归脱敏 body 里 key 命中黑名单的字段 (替换为 '***').
 * 数组/嵌套对象递归处理.
 */
function maskBody(body) {
  if (body === null || body === undefined) return body
  if (typeof body !== 'object') return body
  if (Array.isArray(body)) return body.map(maskBody)
  const out = {}
  for (const [k, v] of Object.entries(body)) {
    if (SENSITIVE_KEYS.some(s => k.toLowerCase().includes(s.toLowerCase()))) {
      out[k] = '***'
    } else if (v && typeof v === 'object') {
      out[k] = maskBody(v)
    } else {
      out[k] = v
    }
  }
  return out
}

const AuditLogSchema = new Schema(
  {
    method: { type: String, required: true, index: true },
    path: { type: String, required: true },
    query: { type: Schema.Types.Mixed, default: null },
    params: { type: Schema.Types.Mixed, default: null },
    body: { type: Schema.Types.Mixed, default: null },

    statusCode: { type: Number, required: true, index: true },
    durationMs: { type: Number, default: 0 },

    actor: {
      _id: { type: Schema.Types.ObjectId, ref: 'User' },
      name: { type: String, default: '' },
      mobile: { type: String, default: '' } // 脱敏后的快照 e.g. 138****1234
    },
    org: {
      _id: { type: Schema.Types.ObjectId, ref: 'Org' },
      name: { type: String, default: '' }
    },

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    requestId: { type: String, default: '' },

    retentionUntil: {
      type: Date,
      default: () => new Date(Date.now() + 180 * 24 * 3600 * 1000)
    }
  },
  { timestamps: true, collection: 'audit_logs' }
)

// 复合索引 (按业务高频筛选)
AuditLogSchema.index({ createdAt: -1 })
AuditLogSchema.index({ 'org._id': 1, createdAt: -1 })
AuditLogSchema.index({ 'actor._id': 1, createdAt: -1 })
AuditLogSchema.index({ method: 1, path: 1, createdAt: -1 })
AuditLogSchema.index({ statusCode: 1, createdAt: -1 })
AuditLogSchema.index({ requestId: 1 })

// TTL: retentionUntil 到期自动删 (180 天后)
AuditLogSchema.index({ retentionUntil: 1 }, { expireAfterSeconds: 0 })

// 静态方法
AuditLogSchema.statics.maskBody = maskBody

module.exports = model('AuditLog', AuditLogSchema)
