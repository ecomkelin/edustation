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

  /**
   * 登录防刷 (2026-06)
   *
   * 两条独立限流线（详见 middlewares/loginRateLimit.js）:
   *  - per-mobile: 防针对某账号的暴力破解, 阈值更严
   *  - per-ip:     防分布式 / 同源多账号扫, 阈值更宽
   *
   * 触发即封 lockMs. 进程内 Map 单实例, 多实例部署需换 Redis (TODO 阶段 2).
   */
  rateLimit: {
    login: {
      // 单 mobile 窗口内允许的最大失败尝试数 (含当前这次)
      mobileMax: Number(process.env.LOGIN_RL_MOBILE_MAX || 5),
      // 单 IP 窗口内允许的最大失败尝试数
      ipMax: Number(process.env.LOGIN_RL_IP_MAX || 30),
      // 统计窗口 (毫秒). 跨窗口自动重置计数
      windowMs: Number(process.env.LOGIN_RL_WINDOW_MS || 15 * 60 * 1000), // 15 min
      // 触发封禁后, 在这段时间内该 key 的所有 /login 请求直接 429
      mobileLockMs: Number(process.env.LOGIN_RL_MOBILE_LOCK_MS || 15 * 60 * 1000), // 15 min
      ipLockMs: Number(process.env.LOGIN_RL_IP_LOCK_MS || 15 * 60 * 1000) // 15 min
    }
  },

  /**
   * 滑块验证码 (2026-06)
   *
   * 设计: 拖动"小图块"对齐背景中的"缺口"位置。
   * SVG 动态生成, 无图片资源依赖; 答案位置服务端持有, 不暴露给前端。
   *
   * 触发: 登录同一 mobile 失败 >= captchaAfterFailures 次后, 下次登录必传 captchaPass
   * (硬卡: 缺 captchaPass → 400 + 提示码 'captcha_required')
   *
   * pass 是 one-time token, 60s 内只能用一次。
   */
  captcha: {
    // 触发滑块验证的失败次数门槛 (含本次). 默认 2: 错 2 次后第 3 次必出滑块
    afterFailures: Number(process.env.CAPTCHA_AFTER_FAILURES || 2),
    // 挑战 token 有效期 (ms)
    challengeTtlMs: Number(process.env.CAPTCHA_CHALLENGE_TTL_MS || 2 * 60 * 1000), // 2 min
    // pass 有效期 (ms) — 拿到 pass 后多久内必须完成登录
    passTtlMs: Number(process.env.CAPTCHA_PASS_TTL_MS || 60 * 1000), // 60 s
    // 容差: 拖动位置和正确位置的允许偏差 (px)
    tolerance: Number(process.env.CAPTCHA_TOLERANCE || 5),
    // 背景 SVG 尺寸
    width: 320,
    height: 160,
    // 拼图块宽度
    pieceWidth: 50
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
