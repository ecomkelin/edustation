'use strict'

/**
 * Cron 路由 (2026-07-13 立项, MM=41)
 *
 * R-4101: GET /admin/cron/status — 平台超管查看所有 cron 的运行时状态
 *
 * 设计:
 *   - 路径前缀 /admin/cron/ (与 /admin/pet /admin/points 保持一致)
 *   - 鉴权走 requirePlatformAdmin (不需要单独权限码; 平台超管就该看到)
 *   - 不写 audit (查 ops 状态不算业务操作)
 */

const express = require('express')
const router = express.Router()
const asyncHandler = require('@utils/asyncHandler')
const mws = require('@middlewares')
const c = require('./cron.controller')

// 鉴权: 全模块统一 requireOrg (cron 状态是平台级, 不分 org, 但框架强制要 header)
router.use(mws.authenticate, mws.requireOrg)

// R-4101 GET /admin/cron/status — 所有 cron 实时状态
// 仅平台超管可见 (cron 状态是 ops 数据, 业务岗用不上)
router.get('/status', mws.requirePlatformAdmin, asyncHandler(c.status))

// R-4102 POST /admin/cron/:name/tick — 手动 trigger 单个 cron (调试用, 绕过 leader 锁)
// 不写 audit (ops 动作, 不是业务操作)
router.post('/:name/tick', mws.requirePlatformAdmin, asyncHandler(c.runTick))

module.exports = router