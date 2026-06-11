'use strict'

const path = require('path')
const envValidator = require('@utils/envValidator')

envValidator()

const env = process.env.NODE_ENV || 'development'

module.exports = {
  env,
  isProd: env === 'production',
  isDev: env === 'development',
  isTest: env === 'test',

  port: Number(process.env.PORT || 8000),

  db: {
    uri: process.env.MONGODB_URI,
    options: {
      // mongoose 8 默认就好，不开 autoIndex (生产用 migration)
      serverSelectionTimeoutMS: 5000
    }
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  },

  cookie: {
    name: process.env.REFRESH_COOKIE_NAME || 'edustation_refresh_token',
    path: '/api/v1/auth/refresh',
    // dev: 默认 lax(同源/同站皆可，足以覆盖 vite proxy 和直连场景)
    // prod: 默认 none(允许前后端跨域；浏览器要求必须配 secure=true，所以 HTTPS 是硬性前提)
    // 若生产是同域反代(nginx)部署，可手动 REFRESH_COOKIE_SAMESITE=lax 降到更严的策略
    secure: process.env.REFRESH_COOKIE_SECURE
      ? process.env.REFRESH_COOKIE_SECURE === 'true'
      : env === 'production',
    sameSite: process.env.REFRESH_COOKIE_SAMESITE || (env === 'production' ? 'none' : 'lax'),
    httpOnly: true,
    maxAgeMs: 7 * 24 * 60 * 60 * 1000 // 7 天
  },

  cors: {
    origins: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  },

  upload: {
    dir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
    baseUrl: process.env.UPLOAD_BASE_URL || '/uploads',
    maxFileSize: 20 * 1024 * 1024 // 20MB
  },

  seed: {
    defaultPassword: process.env.SEED_DEFAULT_PASSWORD || 'Admin@123'
  }
}
