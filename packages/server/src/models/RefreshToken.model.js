'use strict'

const { Schema, model } = require('mongoose')

/**
 * 刷新令牌（RefreshToken）
 *
 * 用于"access token 过期后无需重新登录即可换发"的会话续期机制。
 *
 * 安全设计：
 *   - 数据库中只保存 token 的 hash（tokenHash），不保存明文
 *     即使库被拖，攻击者也无法用这些 hash 还原成可用 token
 *   - 客户端拿到的 token 通过 httpOnly+Secure+SameSite=Strict cookie 下发
 *     （cookie 本身只存 id/hash 等"引用"，真正的 token 校验在服务端进行）
 *   - 每次 refresh 时"轮换"refresh token：旧 token 立即 revoke，新 token 入库
 *
 * 生命周期：
 *   - 创建：登录成功时写入，expiresAt 设为 now + 刷新有效期（例如 30 天）
 *   - 使用：每次 `/api/auth/refresh` 时校验 → 校验通过 → revoke 旧的 + 写入新的
 *   - 退出：isRevoked=true；或前端丢弃 cookie
 *   - 过期：MongoDB TTL 索引（expireAfterSeconds=0）会在 expiresAt 到达时自动删除
 *
 * 关联字段：
 *   - userAgent / ip 用于风控：异常 UA/异地 IP 触发强制下线所有设备
 */
const RefreshTokenSchema = new Schema(
  {
    // 令牌所属用户
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // 令牌 hash（不存明文；unique 索引防重复入库）
    tokenHash: { type: String, required: true, unique: true },
    // 过期时间；TTL 索引将在这一刻自动清理文档
    expiresAt: { type: Date, required: true },
    // 是否已吊销（用户主动登出 / 安全事件触发全设备下线 / refresh 轮换时旧 token 置 true）
    isRevoked: { type: Boolean, default: false },
    // 颁发时的 User-Agent，用于多设备管理和风控（"在哪个设备/浏览器登录的"）
    userAgent: { type: String },
    // 颁发时的 IP（同上；异常 IP 可触发强制下线）
    ip: { type: String }
  },
  { timestamps: true, collection: 'refresh_tokens' }
)

// TTL 索引：expiresAt 一到就清掉（Mongo 自身后台任务处理）
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
// 查"该用户的有效令牌"（用于多设备管理/强制下线）
RefreshTokenSchema.index({ user: 1, isRevoked: 1 })

module.exports = model('RefreshToken', RefreshTokenSchema)
