import http from './http'

/**
 * AI 助手 API
 *  - ping: 连通性测试 (兼容旧 AiChatTest.vue)
 *  - chat: 非流式纯文本 (兼容旧 AiChatTest.vue)
 *  - listTools: 列出可用工具元数据 (前端 AiAssistant.vue 用)
 *  - parseFile: 解析单个文件 (内部由 chat-stream 自动调用, 也可单独调试)
 *  - executeTool: 高风险工具经前端确认后真正落库
 *
 * 流式 chat (SSE) 走 useAgentStream composable, 不走 axios.
 */
export const agentApi = {
  ping: () => http.get('/agent/ping'),
  chat: (data) => http.post('/agent/chat', data),

  listTools: () => http.get('/agent/tools'),
  parseFile: (fileId) => http.post('/agent/parse-file', { fileId }),
  executeTool: ({ toolName, args, confirmed }) =>
    http.post('/agent/execute', { toolName, args, confirmed: !!confirmed })
}