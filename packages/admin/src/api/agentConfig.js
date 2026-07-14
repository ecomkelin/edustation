import http from './http'

/**
 * AI 助手平台级配置 API (systemPrompt / temperature / maxTokens)
 *
 * 后端路由 /api/v1/agent/config 见 packages/server/src/modules/agent/agentConfig.routes.js
 * - GET 公开给登录用户 (前端不消费, 仅供未来 debug)
 * - PUT 仅平台超管 (requirePlatformAdmin)
 *
 * 客户端 AiAssistant.vue 不再传这 3 字段, 全部走 AgentConfig (DB-first, env-fallback).
 */
export const agentConfigApi = {
  get: () => http.get('/agent/config'),
  update: (data) => http.put('/agent/config', data)
}