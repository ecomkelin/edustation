'use strict'

/**
 * 一体机 webhook 路由 (独立子路由, 在 app.js 中 express.json 之前挂载)
 *
 * 必须先于 express.json 处理: webhookAuth.middleware 用 req.rawBody 算 sha256 验签。
 * 主路由 (admin + client 端) 在 routers/index.js 走标准 json 流程, 不在本文件。
 *
 * 端点:
 *   POST /webhook/:deviceSn         - 进出事件回调
 *   POST /webhook/:deviceSn/heartbeat - 设备心跳
 */

const express = require('express')
const router = express.Router()
const c = require('./accessControl.controller')
const webhookAuth = require('./webhookAuth.middleware')
const asyncHandler = require('@utils/asyncHandler')

const rawJson = express.raw({ type: '*/*', limit: '4mb' })

// R-2990 POST /access-control/webhook/:deviceSn
router.post('/webhook/:deviceSn', rawJson, webhookAuth, asyncHandler(c.webhook))
// R-2992 POST /access-control/webhook/:deviceSn/heartbeat
router.post('/webhook/:deviceSn/heartbeat', rawJson, webhookAuth, asyncHandler(c.heartbeat))

module.exports = router
