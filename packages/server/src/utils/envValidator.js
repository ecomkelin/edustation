'use strict'

const REQUIRED = [
  'MONGODB_URI',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET'
]

/**
 * 启动时强校验必需环境变量。失败 throw 阻止启动。
 */
function envValidator() {
  const missing = REQUIRED.filter((k) => !process.env[k])
  if (missing.length) {
    throw new Error(
      `[env] Missing required environment variables: ${missing.join(', ')}\n` +
        '请参考 packages/server/.env.example 创建 .env 文件'
    )
  }

  // 弱校验：secret 太短给警告
  if (process.env.NODE_ENV === 'production') {
    for (const k of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
      if (process.env[k].length < 32) {
        throw new Error(`[env] ${k} must be at least 32 chars in production`)
      }
    }
  }
}

module.exports = envValidator
