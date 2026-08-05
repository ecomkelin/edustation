'use strict'

const express = require('express')
const cookieParser = require('cookie-parser')
const cors = require('cors')
const fs = require('fs')

const config = require('@config/index')
const { buildCorsOptions } = require('@config/cors')
const mws = require('@middlewares')
const { requestLogger } = require('@utils/logger')
const apiRouter = require('./routers')

/**
 * 构造 Express app（不 listen）。被 main.js / 测试共同使用。
 */
function createApp() {
  const app = express()

  // 2026-08-05: trust proxy (审计 L15)
  //   nginx 反代后 `req.ip` 全部为 nginx IP, loginRateLimit per-IP 桶塌缩成单一桶
  //   (一个滥用者能锁掉整个办公室 NAT 后所有人); RefreshToken.ip / auditTrail.ip 也失去取证价值.
  //   显式 opt-in: TRUST_PROXY=1 / true 时设 1 (信任 1 层代理, 即 nginx);
  //   不设则默认 false, 防止 X-Forwarded-For 伪造影响限流/审计 IP 取证.
  //   prod 部署应配 TRUST_PROXY=1, dev 单机直连保持 false.
  if (process.env.TRUST_PROXY === '1' || process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1)
  }

  // body / cookie / cors
  app.use(cors(buildCorsOptions()))

  // 一体机 webhook 需要 raw body (HMAC 验签 sha256(rawBody)), 必须在 express.json 之前挂载
  // 仅 access-control 的 webhook 走 raw, 其他路径仍走 json
  const accessControlWebhook = require('@modules/accessControl/accessControl.webhookRoutes')
  app.use('/api/v1/access-control', accessControlWebhook)

  app.use(express.json({ limit: '2mb' }))
  app.use(express.urlencoded({ extended: true }))
  app.use(cookieParser())

  // requestId + 访问日志
  app.use(mws.requestId)
  app.use(requestLogger)

  // 静态：上传的文件
  if (!fs.existsSync(config.upload.dir)) {
    fs.mkdirSync(config.upload.dir, { recursive: true })
  }
  app.use(config.upload.baseUrl, express.static(config.upload.dir))

  // 健康检查 (无需 /api 前缀)
  app.get('/health', (req, res) => {
    res.json({
      success: true,
      data: {
        uptime: process.uptime(),
        env: config.env,
        timestamp: new Date().toISOString()
      }
    })
  })

  // API
  app.use('/api/v1', apiRouter)

  // 404 + error
  app.use('/api', mws.notFound)
  app.use(mws.errorHandler)

  return app
}

module.exports = { createApp }
