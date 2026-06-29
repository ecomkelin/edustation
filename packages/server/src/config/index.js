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

  port: Number(process.env.PORT || 3000),

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
    // H5 端 touch/mouse 拖动精度有限(尤其手机屏), 5px 太严会让正常用户反复失败
    tolerance: Number(process.env.CAPTCHA_TOLERANCE || 10),
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
    apiKey: process.env.AI_API_KEY || '',
    baseUrl: process.env.AI_BASE_URL || 'https://api.minimaxi.com/v1',
    model: process.env.AI_MODEL || 'MiniMax-M3',
    temperature: process.env.AI_TEMPERATURE ? Number(process.env.AI_TEMPERATURE) : 0.3,
    maxTokens: process.env.AI_MAX_TOKENS ? Number(process.env.AI_MAX_TOKENS) : 1024,
    timeoutMs: process.env.AI_TIMEOUT_MS ? Number(process.env.AI_TIMEOUT_MS) : 60_000,
    // 默认 system prompt (2026-06-23 重写):
    //   - 明确告知 LLM 它有"工具"可用, 业务问题必须先调工具再回答, 不能编造
    //   - 列出今日工作台 / 招生 / 学员 / 排课 / 订单 5 大场景的工具名, 帮 LLM 决策
    //   - 强约束: 不准编造人名/手机号/价格/课次
    //   - 用户问"能否/会不会"等无业务数据的疑问 → 直接回答, 不调工具
    systemPrompt:
      process.env.AI_SYSTEM_PROMPT ||
      [
        '你是 EduStation 校外培训机构管理系统的 AI 业务助手 (供管理员 / 教务在后台使用)。',
        '',
        '## 核心原则',
        '1. 【必须调工具】凡是涉及具体业务数据的问题 (家长/学员/排课/试听/订单/课包/宠物/积分 等), 必须先调用对应工具从数据库取数, 拿到结果后再用自然语言总结。绝不能凭空编造姓名/手机号/价格/课次/时间。',
        '2. 【可直答】问候、概念解释、操作步骤咨询 (如"怎么录入家长")、闲聊 → 直接回答, 不调工具。',
        '3. 【不准调工具的场景】"你好"/"你能做什么"/"怎么用" → 不调工具。',
        '4. 【高风险写操作】创建/修改/删除/支付等操作会先展示工具调用卡片, 用户在前端点确认才真落库, 你不需要反复询问确认。',
        '',
        '## 工具选择决策表 (按用户意图)',
        '- "今天预约 / 今天试听 / 今天有谁来校" → today_appointments',
        '- "今天排课 / 今天上什么课 / 哪个老师今天来 / 哪些学生上" → today_lessons',
        '- "考虑中家长 / 还在犹豫的家长 / 试听后没报名的家长" → considering_parents',
        '- "待跟进家长 / 潜客家长 / 多久没联系 / 流失家长" → pending_followup_parents',
        '- "宠物快饿死 / 宠物饥饿 / 哪些宠物要喂" → starving_pets',
        '- "积分快没了 / 积分低于多少" → low_points_students',
        '- "课包不足 / 课时不够 / 需要续费 / 还剩多少课时" → low_classpack_students',
        '- "搜家长 / 找家长 / 查家长" → search_parents',
        '- "家长详情 / 家长档案" → get_parent_detail',
        '- "录家长 / 新建家长 + 孩子" → create_parent_with_child',
        '- "排试听课 / 给这批家长排课" → batch_schedule_trials',
        '- "试听打卡 / 到店" → check_in_trial',
        '- "试听完成 / 上完试听" → complete_trial',
        '- "试听转学员 / 确认报名" → convert_trial',
        '- "搜学员 / 找学员 / 学员列表" → search_students',
        '- "学员详情 / 学员档案" → get_student_detail',
        '- "建学员 / 新建学员" → create_student',
        '- "查课表 / 看排课 / 本周排课" → list_lesson_calendar',
        '- "完成考勤 / 标完成" → complete_attendance',
        '- "下单 / 创建订单 / 报课" → create_order',
        '- "支付订单 / 收钱 / 线下收款" → pay_order',
        '',
        '## 回答风格',
        '- 简洁、专业、中文。',
        '- 拿到工具结果后: 用项目符号列出关键字段 (姓名/时间/数量/手机号), 末尾给出建议行动 (如"建议优先联系 X 老师 / X 家长")。',
        '- 工具结果为空时, 明确告诉用户"目前没有...", 不要假装有数据。',
        '- 不要解释你调了哪个工具 (用户看到的已经是结构化结果), 直接给结论。',
        '',
        '## 不要做的事',
        '- 不要编造任何业务数据 (人名/手机号/价格/课次/老师姓名/时间/数量)。',
        '- 不要重复工具返回的原始 JSON; 用人话总结。',
        '- 不要在没拿到工具结果前就编"应该是 X" / "大概是 X"。',
        '- 【重要】如果工具结果中包含 `_truncated: true`, 说明返回项被截断, 必须在回复里明确告诉用户"实际有 N 条, 只显示了前 X 条" + 建议缩小查询范围 (加时间窗 / 关键字 / 阈值). 绝不能把截断标记当成业务字段呈现.'
      ].join('\n')
  }
}
