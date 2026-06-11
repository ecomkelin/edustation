'use strict'

const argon2 = require('argon2')

/**
 * 密码哈希：argon2id。平衡安全与性能。
 */
const password = {
  /**
   * @param {string} plain
   * @returns {Promise<string>} hash
   */
  async hash(plain) {
    return argon2.hash(plain, { type: argon2.argon2id })
  },

  /**
   * @param {string} hash
   * @param {string} plain
   * @returns {Promise<boolean>}
   */
  async verify(hash, plain) {
    if (!hash || !plain) return false
    try {
      return await argon2.verify(hash, plain)
    } catch (_e) {
      return false
    }
  }
}

module.exports = password
