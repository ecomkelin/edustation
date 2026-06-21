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
