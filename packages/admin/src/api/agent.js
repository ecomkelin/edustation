import http from './http'

/**
 * AI 助手 API
 *  - ping: 连通性测试 (兼容旧 AiChatTest.vue)
 *  - chat: 非流式纯文本 (兼容旧 AiChatTest.vue)
 *  - listTools: 列出可用工具元数据 (前端 AiAssistant.vue 用)
 *  - parseFile: 解析单个文件 (内部由 chat-stream 自动调用, 也可单独调试)
 *  - executeTool: 高风险工具经前端确认后真正落库 (2026-06 升级: 接收 conversationId/toolCallId)
 *
 *  - conversation: 会话管理 (2026-06 新增)
 *     list / create / get / patch / delete
 *
 * 流式 chat (SSE) 走 useAgentStream composable, 不走 axios.
 */
export const agentApi = {
  ping: () => http.get('/agent/ping'),
  chat: (data) => http.post('/agent/chat', data),

  listTools: () => http.get('/agent/tools'),
  parseFile: (fileId) => http.post('/agent/parse-file', { fileId }),
  executeTool: ({ toolName, args, confirmed, conversationId, toolCallId }) =>
    http.post('/agent/execute', { toolName, args, confirmed: !!confirmed, conversationId, toolCallId }),

  /* ─── 会话管理 (2026-06) ─────── */
  listConversations: (params = {}) => http.get('/agent/conversations', { params }),
  createConversation: (data = {}) => http.post('/agent/conversations', data),
  getConversation: (id, params = {}) => http.get(`/agent/conversations/${id}`, { params }),
  patchConversation: (id, data) => http.patch(`/agent/conversations/${id}`, data),
  deleteConversation: (id) => http.delete(`/agent/conversations/${id}`),
  addMessage: (id, data) => http.post(`/agent/conversations/${id}/messages`, data),

  /* ─── 平台超管: 会话管理 (2026-06-18) ─────── */
  // (2026-06-18) 物理删, 不再提供 restore 接口
  adminListConversations: (params = {}) => http.get('/agent/admin/conversations', { params }),
  adminGetConversation: (id) => http.get(`/agent/admin/conversations/${id}`),
  adminBatchDelete: (ids) => http.post('/agent/admin/conversations/batch-delete', { ids })
}