import http from './http'

/**
 * AI 智能客服 测试页 API
 *  - ping: 一键连通性测试
 *  - chat: 多轮对话
 */
export const agentApi = {
  ping: () => http.get('/agent/ping'),
  chat: (data) => http.post('/agent/chat', data)
}
