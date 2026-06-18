'use strict'

const router = require('express').Router()
const c = require('./agent.controller')
const v = require('./agent.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

/**
 * AI 助手路由 (2026-06 升级为完整 tool use + SSE)
 *
 * 鉴权策略：
 *  - 全部端点需要 authenticate (登录)
 *  - 除 /ping 与 /chat 外, 其他端点 requireOrg (前端 AiAssistant.vue 在切到具体机构后才用)
 *  - 权限码: agent.read (访问) / agent.write (写操作)
 *    工具级别权限 (recruit.write / order.pay 等) 在 executor 内部按 user.positions 聚合校验
 *  - 限流/审计 在阶段 4 加, 当前 MVP 不做
 */

router.use(mws.authenticate)

// ping 与 chat 兼容旧 AiChatTest.vue (不强 requireOrg, 便于开发期排查)
router.get('/ping', asyncHandler(c.ping))
router.post('/chat', v.chat, mws.validateRequest, asyncHandler(c.chat))

// 新端点要求 org 上下文
router.use(mws.requireOrg)

// 工具元数据 (GET 无副作用, 仅读权限即可; 但前端菜单 perm 走 agent.write 整体门控)
router.get('/tools', asyncHandler(c.listTools))

// 文件解析 (单测用, 不走 LLM; 生产中由 chat/stream 内部调)
router.post('/parse-file', v.parseFile, mws.validateRequest, asyncHandler(c.parseFile))

// 核心 SSE 流式 chat + tool use (2026-06 升级: 接收 conversationId, 自动落库消息)
router.post('/chat/stream', v.chatStreamWithConv, mws.validateRequest, asyncHandler(c.chatStream))

// 高风险工具经前端确认后, 单独执行 (不经 LLM; 2026-06 升级: 接收 conversationId, 落库 tool_result 消息)
router.post('/execute', v.executeWithConv, mws.validateRequest, asyncHandler(c.executeTool))

/* ─── 会话 (conversation) 路由 (2026-06) ─────── */
// 权限: agent.read
router.get('/conversations', asyncHandler(c.listConversations))
router.post('/conversations', v.createConversation, mws.validateRequest, asyncHandler(c.createConversation))
router.get('/conversations/:id', v.getConversation, mws.validateRequest, asyncHandler(c.getConversation))
router.patch('/conversations/:id', v.patchConversation, mws.validateRequest, asyncHandler(c.patchConversation))
router.delete('/conversations/:id', v.deleteConversation, mws.validateRequest, asyncHandler(c.deleteConversation))
// 手工追加消息 (chatStream/executeTool 内部已自动持久化, 此端点留作调试/补登)
router.post('/conversations/:id/messages', v.addMessage, mws.validateRequest, asyncHandler(c.addMessage))

/* ─── 平台超管: 会话管理 (2026-06-18) ─────── */
// requireOrg 对超管直通, 没传 x-org-id 时 req.orgId=null, controller 内 isPlatformAdmin 二次校验
// (2026-06-18) 物理删, 不提供恢复端点
router.get('/admin/conversations', asyncHandler(c.adminListConversations))
router.get('/admin/conversations/:id', v.adminGetConversation, mws.validateRequest, asyncHandler(c.adminGetConversation))
router.post('/admin/conversations/batch-delete', v.adminBatchDelete, mws.validateRequest, asyncHandler(c.adminBatchDelete))

module.exports = router