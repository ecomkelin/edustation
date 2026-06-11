'use strict'

const config = require('@config/index')

/**
 * dev/test 允许任意 origin (用于 cookie-based 跨域)
 * production 必须显式 CORS_ORIGINS 白名单
 */
function buildCorsOptions() {
  const origins = config.cors.origins
  if (config.isProd && origins.length === 0) {
    throw new Error('CORS_ORIGINS must be set in production')
  }

  if (origins.length === 0) {
    // dev: 允许所有 (cors 库会自动回显 origin)
    return {
      origin: true,
      credentials: true
    }
  }

  return {
    origin(origin, cb) {
      if (!origin || origins.includes(origin)) {
        return cb(null, true)
      }
      return cb(new Error(`Origin ${origin} not allowed by CORS`))
    },
    credentials: true
  }
}

module.exports = { buildCorsOptions }
