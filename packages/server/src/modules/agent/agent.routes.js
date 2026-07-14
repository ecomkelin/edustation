'use strict'

const router = require('express').Router()
const c = require('./agent.controller')
const v = require('./agent.validator')
const agentConfigController = require('./agentConfig.controller')
const agentConfigValidator = require('./agentConfig.validator')
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
 *  - /agent/config (R-2840/2841, 2026-07-14 立项) 是平台级配置, GET 不需要 org, PUT 走 requirePlatformAdmin
 *  - 限流/审计 在阶段 4 加, 当前 MVP 不做
 */

router.use(mws.authenticate)

// R-2840 GET /agent/config — 平台级 AI 配置, 公开给登录用户 (不需 org context, 不走 requireOrg)
//   平台超管切机构前可能没 active org, 必须挂在 requireOrg 之前
router.get('/config', asyncHandler(agentConfigController.get))

// ping 与 chat 兼容旧 AiChatTest.vue (不强 requireOrg, 便于开发期排查)
// R-2800 GET /agent/ping
router.get('/ping', asyncHandler(c.ping))
// R-2801 POST /agent/chat
router.post('/chat', v.chat, mws.validateRequest, asyncHandler(c.chat))

// 新端点要求 org 上下文
router.use(mws.requireOrg)

// 工具元数据 (GET 无副作用, 仅读权限即可; 但前端菜单 perm 走 agent.write 整体门控)
// R-2806 GET /agent/tools
router.get('/tools', asyncHandler(c.listTools))

// 文件解析 (单测用, 不走 LLM; 生产中由 chat/stream 内部调)
// R-2802 POST /agent/parse-file
router.post('/parse-file', v.parseFile, mws.validateRequest, asyncHandler(c.parseFile))

// 核心 SSE 流式 chat + tool use (2026-06 升级: 接收 conversationId, 自动落库消息)
// R-2803 POST /agent/chat/stream
router.post('/chat/stream', v.chatStreamWithConv, mws.validateRequest, asyncHandler(c.chatStream))

// 高风险工具经前端确认后, 单独执行 (不经 LLM; 2026-06 升级: 接收 conversationId, 落库 tool_result 消息)
// R-2804 POST /agent/execute
router.post('/execute', v.executeWithConv, mws.validateRequest, asyncHandler(c.executeTool))

/* ─── 会话 (conversation) 路由 (2026-06) ─────── */
// 权限: agent.read
// R-2810 GET /agent/conversations
router.get('/conversations', asyncHandler(c.listConversations))
// R-2811 POST /agent/conversations
router.post('/conversations', v.createConversation, mws.validateRequest, asyncHandler(c.createConversation))
// R-2812 GET /agent/conversations/:id
router.get('/conversations/:id', v.getConversation, mws.validateRequest, asyncHandler(c.getConversation))
// R-2813 PATCH /agent/conversations/:id
router.patch('/conversations/:id', v.patchConversation, mws.validateRequest, asyncHandler(c.patchConversation))
// R-2814 DELETE /agent/conversations/:id
router.delete('/conversations/:id', v.deleteConversation, mws.validateRequest, asyncHandler(c.deleteConversation))
// 手工追加消息 (chatStream/executeTool 内部已自动持久化, 此端点留作调试/补登)
// R-2815 POST /agent/conversations/:id/messages
router.post('/conversations/:id/messages', v.addMessage, mws.validateRequest, asyncHandler(c.addMessage))

/* ─── 平台超管: 会话管理 (2026-06-18) ─────── */
// requireOrg 对超管直通, 没传 x-org-id 时 req.orgId=null, controller 内 isPlatformAdmin 二次校验
// (2026-06-18) 物理删, 不提供恢复端点
// R-2820 GET /agent/admin/conversations
router.get('/admin/conversations', asyncHandler(c.adminListConversations))
// R-2821 GET /agent/admin/conversations/:id
router.get('/admin/conversations/:id', v.adminGetConversation, mws.validateRequest, asyncHandler(c.adminGetConversation))
// R-2822 POST /agent/admin/conversations/batch-delete
router.post('/admin/conversations/batch-delete', v.adminBatchDelete, mws.validateRequest, asyncHandler(c.adminBatchDelete))

/* ─── 平台客服 (support-mode, 2026-07-02 立项 C 端 4 tab 重构) ─── */
// 每个家长在每个机构下唯一 1 个"客服助理"永久会话,供 C 端"消息 tab" 顶部 sticky 卡点入
// (2026-07-02) 不开新 PERM,沿用现有 agent 鉴权链 (登入 + org 上下文),因为前端全包在 app 内
// 不暴露独立 PERM 是有意为之 — 这套接口对家长是低风险,前端 pin-up "AI 客服"卡本身就是权限 UI 入口
// R-2830 POST /agent/chat/support — SSE 流式 (复用 chatStream logic + 客服 systemPrompt)
router.post('/chat/support', v.chatStreamWithConv, mws.validateRequest, asyncHandler(c.support))
// R-2831 POST /agent/chat/support/reset — 清空会话消息 (保留 conv 行)
router.post('/chat/support/reset', asyncHandler(c.supportReset))
// R-2832 GET /agent/chat/support/history — 拉取会话历史
router.get('/chat/support/history', asyncHandler(c.supportHistory))

/* ─── 平台级 AI 配置 (2026-07-14 立项) ─── */
// R-2841 PUT /agent/config — 仅平台超管 (requireOrg 对超管直通, controller 二次校验)
router.put('/config',
  mws.requirePlatformAdmin,
  agentConfigValidator.update,
  mws.validateRequest,
  asyncHandler(agentConfigController.update))

module.exports = router