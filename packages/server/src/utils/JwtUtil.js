'use strict'

const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const config = require('@config/index')

// 2026-08-05: JWT 加固 (审计 L14 + L16)
//   L14: 钉死 algorithms 与 issuer/audience — 防 alg-confusion 与跨服务重放
//     (jsonwebtoken@9 已挡 alg=none 攻击, 但显式 algorithms=['HS256'] 是最佳实践).
//   L16: jti 用 crypto.randomBytes(16) 替代 Date.now()+Math.random()
//     (防 jti 可猜; 当前 jti 未用于黑名单, 但 refresh familyId 已用作撤销 token,
//      未来 jti 若做撤销, 加密随机是必须的).
const JWT_ALGORITHMS = ['HS256']
const JWT_ISSUER = 'edustation'
const JWT_AUDIENCE = 'edustation-api'

/**
 * JWT 工具，区分 access / refresh 两套密钥。
 * payload 不放敏感信息，只放 userId + role。
 */
const JwtUtil = {
  /**
   * @param {object} payload
   * @param {string} [expiresIn]
   * @returns {string} token
   */
  signAccessToken(payload) {
    return jwt.sign(payload, config.jwt.accessSecret, {
      expiresIn: config.jwt.accessExpiresIn,
      algorithm: JWT_ALGORITHMS[0],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    })
  },

  /**
   * @param {object} payload
   * @returns {string} refresh token
   */
  signRefreshToken(payload) {
    // 2026-08-05: jti 用加密随机 (审计 L16) — 16 字节 → 32 hex 字符, 字典空间 2^128
    //   jti 是 JWT 标准 claim, 属于 payload 字段而非 sign options (jsonwebtoken@9 校验严格,
    //   把 jti 放在 options 会抛 "jti is not allowed in options").
    const enrichedPayload = {
      ...payload,
      jti: payload.jti || crypto.randomBytes(16).toString('hex')
    }
    return jwt.sign(enrichedPayload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
      algorithm: JWT_ALGORITHMS[0],
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    })
  },

  /**
   * @param {string} token
   * @returns {object} payload
   */
  verifyAccessToken(token) {
    return jwt.verify(token, config.jwt.accessSecret, {
      algorithms: JWT_ALGORITHMS,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    })
  },

  /**
   * @param {string} token
   * @returns {object} payload
   */
  verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret, {
      algorithms: JWT_ALGORITHMS,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE
    })
  },

  /**
   * 哈希 token 用于 RefreshToken.tokenHash 字段
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex')
  }
}

module.exports = JwtUtil
