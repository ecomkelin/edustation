'use strict'

const router = require('express').Router()
const c = require('./agent.controller')
const v = require('./agent.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

/**
 * AI 智能客服路由（阶段 3 搭建基础 / 阶段 4 完善流式与体验）。
 *
 * 鉴权策略：
 *  - ping/chat 都需要登录（管理后台测试页使用）
 *  - 不强制 requireOrg：测试场景下平台超管可能还没切到具体机构也能跑
 *  - 任何登录用户都能调用，但生产环境应再加一层角色/IP 限流（后续阶段补）
 */

router.use(mws.authenticate)

router.get('/ping', asyncHandler(c.ping))
router.post('/chat', v.chat, mws.validateRequest, asyncHandler(c.chat))

module.exports = router
