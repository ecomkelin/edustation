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
    maxFileSize: 20 * 1024 * 1024 // 20MB（保留：阶段 1 仍由 studentWork 旧路径使用）
  },

  /**
   * 统一文件存储（阶段 1：本地磁盘；阶段 2 切 MinIO/S3）。
   * 详见 packages/server/src/modules/storage/。
   *
   * 关键约定：
   *  - `local.dir` / `local.baseUrl` 是 `local` 驱动专用。MinIO 切进来后会被忽略。
   *  - `maxFileSize` 是统一入站上限（multer 限制），业务模块不可绕过。
   *  - `allowedMime` 是白名单（防上传可执行文件等），所有 driver 共享。
   */
  storage: {
    driver: process.env.STORAGE_DRIVER || 'local', // 'local' | 's3'
    maxFileSize: 20 * 1024 * 1024, // 20MB
    maxFilesPerUpload: 20,
    local: {
      dir: path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'uploads'),
      baseUrl: process.env.UPLOAD_BASE_URL || '/uploads'
    },
    s3: {
      endpoint: process.env.S3_ENDPOINT || '',
      region: process.env.S3_REGION || 'us-east-1',
      bucket: process.env.S3_BUCKET || 'edustation',
      accessKeyId: process.env.S3_ACCESS_KEY || '',
      secretAccessKey: process.env.S3_SECRET_KEY || '',
      forcePathStyle: true // MinIO 需要
    },
    allowedMime: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
      'video/mp4', 'video/quicktime', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/aac',
      'application/pdf'
    ]
  },

  seed: {
    defaultPassword: process.env.SEED_DEFAULT_PASSWORD || 'Admin@123'
  },

  /**
   * AI 智能客服（阶段 3）
   * 当前 provider：MiniMax（OpenAI 兼容 chat completions）。
   * 留空 API_KEY / AI_ENABLED=false 时，agent/ping 会以 ok=false 返回，前端可正常展示。
   */
  ai: {
    enabled: process.env.AI_ENABLED === 'true',
    provider: process.env.AI_PROVIDER || 'MiniMax',
    apiKey: process.env.MINIMAX_API_KEY || '',
    baseUrl: process.env.MINIMAX_BASE_URL || 'https://api.minimaxi.com/v1',
    model: process.env.MINIMAX_MODEL || 'MiniMax-M3',
    temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.7,
    maxTokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1024,
    timeoutMs: process.env.AI_TIMEOUT_MS ? Number(process.env.AI_TIMEOUT_MS) : 60_000,
    // 默认 system prompt：让模型知道"自己"是机构客服，约束胡编课程包/价格
    systemPrompt:
      process.env.AI_SYSTEM_PROMPT ||
      '你是 EduStation 校外培训机构管理系统的 AI 客服助手。回答要简洁、专业、礼貌。' +
        '若用户问到具体课程包价格/课次/教师姓名等可能随时变化的业务信息，请提示用户"以系统内最新数据为准"，不要凭空编造。'
  }
}
