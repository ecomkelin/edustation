'use strict'

const jwt = require('jsonwebtoken')
const crypto = require('crypto')
const config = require('@config/index')

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
      expiresIn: config.jwt.accessExpiresIn
    })
  },

  /**
   * @param {object} payload
   * @returns {string} refresh token
   */
  signRefreshToken(payload) {
    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn
    })
  },

  /**
   * @param {string} token
   * @returns {object} payload
   */
  verifyAccessToken(token) {
    return jwt.verify(token, config.jwt.accessSecret)
  },

  /**
   * @param {string} token
   * @returns {object} payload
   */
  verifyRefreshToken(token) {
    return jwt.verify(token, config.jwt.refreshSecret)
  },

  /**
   * 哈希 token 用于 RefreshToken.tokenHash 字段
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex')
  }
}

module.exports = JwtUtil
