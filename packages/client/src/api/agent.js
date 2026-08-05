/**
 * Agent API - AI 智能助手
 *
 * R-2803 chat/stream (SSE) / R-2810-2815 conversation CRUD
 * R-2830 / R-2831 / R-2832 (2026-07-02 立项 C 端 4 tab 重构):
 *   - chat/support     平台客服 SSE 流式 (固定 1 个永久会话, 注入客服 systemPrompt)
 *   - chat/support/reset   清空永久会话消息 (保留 conversation 行)
 *   - chat/support/history 拉取永久会话历史 (供前端"消息 tab"开页时预填)
 *
 * 流式响应: H5 走 fetch + ReadableStream + TextDecoder 解析 SSE 帧 (\n\n 分隔)
 * 其他端 (小程序/App) 走 uni.request 暂不支持流式, 用 callback 兜底
 */
import { storage, StorageKeys } from '@/utils/storage'
import { http } from './request'

// #ifdef H5
const BASE_URL = '/api/v1' // H5 走 vite proxy
// #endif
// #ifndef H5
// 小程序 / App 无 dev proxy, 直连后端.
// uni-app 编译时 import.meta.env.VITE_* 会被丢成 {}, fallback localhost → 微信开发者工具里 localhost 不通.
// 调试: 直接改 DEV_API_HOST 为本机局域网 IP (后端需监听 0.0.0.0).
// 部署: 改用 manifest.json / 运行时配置 / 环境变量注入.
const DEV_API_HOST = 'http://192.168.1.185:3000'
const BASE_URL = `${DEV_API_HOST}/api/v1`
// #endif

/**
 * 构造带 auth / org / active student 的 header
 */
function buildAuthHeaders() {
  const auth = storage.get(StorageKeys.AUTH)
  const headers = { 'Content-Type': 'application/json' }
  if (auth && auth.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`
  }
  const orgId = storage.get(StorageKeys.ORG_ID)
  if (orgId) headers['x-org-id'] = orgId
  const studentId = storage.get(StorageKeys.ACTIVE_STUDENT)
  if (studentId) headers['x-active-student-id'] = studentId
  return headers
}

/**
 * 解析 SSE 帧 (event: + data:) 为 JS 对象
 * 通用 helper,被普通 chatStream / supportStream 共用
 */
function parseSseFrames(buffer, frame, handlers) {
  let event = 'message'
  let data = ''
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return buffer
  let payload
  try { payload = JSON.parse(data) } catch (_) { return buffer }
  // 兼容事件字段 + payload 字段两种协议
  const ev = event !== 'message' ? event : (payload.event || 'message')
  if (ev === 'delta' || payload.delta) {
    const d = payload.delta || payload.content || ''
    handlers.onDelta && handlers.onDelta(d)
  } else if (ev === 'done' || payload.done) {
    handlers.onDone && handlers.onDone(payload)
  } else if (ev === 'error' || payload.error) {
    handlers.onError && handlers.onError(new Error(payload.message || payload.error || '流式错误'))
  }
  return ''
}

/**
 * 通用 SSE 读取 (H5): fetch + ReadableStream + TextDecoder
 * 复用 logic 避免 chatStream / supportStream 重复
 */
function readSseStream(response, handlers) {
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  return (async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, idx)
        buffer = parseSseFrames(buffer.slice(idx + 2), frame, handlers)
      }
    }
    handlers.onComplete && handlers.onComplete()
  })()
}

/**
 * 流式 chat - 普通会话 (R-2803)
 */
export function chatStream(opts) {
  const { message, conversationId, organizationId, onDelta, onDone, onError } = opts
  const headers = { ...buildAuthHeaders(), Accept: 'text/event-stream' }
  // (2026-07-02 旧 wrapper 传 body.message 是与 server validator 不一致的; 不在本 PR 修复, 留作后续)
  const body = { message, conversationId, organizationId }

  fetch(`${BASE_URL}/agent/chat/stream`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body)
  })
    .then(async (response) => {
      if (!response.ok) {
        let errMsg = `请求失败 (${response.status})`
        try {
          const body = await response.json()
          if (body.message) errMsg = body.message
        } catch (_) {}
        onError && onError(new Error(errMsg))
        return
      }
      let fullText = ''
      await readSseStream(response, {
        onDelta: (d) => { fullText += d; onDelta && onDelta(d) },
        onDone: (payload) => onDone && onDone(fullText, payload.conversationId || conversationId),
        onError
      })
    })
    .catch((err) => onError && onError(err))
}

/**
 * R-2830 平台客服 SSE 流式 (2026-07-02 立项)
 *
 * 行为:
 *   - 后端 findOrCreateSupport 自动拿到/创建 1 个永久会话
 *   - 服务端注入客服 systemPrompt (家长可覆盖)
 *   - 返回结构同 chatStream, onDone 第二参为 conversationId (永久会话 ID, 后续可复用)
 *
 * 区别于 chatStream:
 *   - 路径 /agent/chat/support
 *   - body 走 messages 数组 (本端点是新建, 走 server 期望的 schema)
 */
export function supportStream(opts) {
  const { message, onDelta, onDone, onError, messages } = opts
  const headers = { ...buildAuthHeaders(), Accept: 'text/event-stream' }
  // 优先用显式 messages 数组,否则把 message 包成 user 消息
  const body = messages && messages.length
    ? { messages }
    : { messages: [{ role: 'user', content: message || '' }] }

  fetch(`${BASE_URL}/agent/chat/support`, {
    method: 'POST',
    credentials: 'include',
    headers,
    body: JSON.stringify(body)
  })
    .then(async (response) => {
      if (!response.ok) {
        let errMsg = `请求失败 (${response.status})`
        try {
          const body = await response.json()
          if (body.message) errMsg = body.message
        } catch (_) {}
        onError && onError(new Error(errMsg))
        return
      }
      let fullText = ''
      await readSseStream(response, {
        onDelta: (d) => { fullText += d; onDelta && onDelta(d) },
        onDone: (payload) => onDone && onDone(fullText, payload.conversationId),
        onError
      })
    })
    .catch((err) => onError && onError(err))
}

/**
 * R-2831 清空平台客服永久会话的消息 (保留 conversation 行)
 * 用于"新对话"按钮
 */
export function supportReset() {
  return http.post('/agent/chat/support/reset', {})
}

/**
 * R-2832 拉取平台客服永久会话的历史 (含 messages 数组)
 * 用于前端"消息 tab"开页时预填
 * 返回: { conversation, messages: [] } (无会话时 conversation=null)
 */
export function supportHistory() {
  return http.get('/agent/chat/support/history')
}

/** 普通会话管理 (R-2810-2815) */
export const conversationApi = {
  list(params = {}) {
    return http.get('/agent/conversations', { data: params })
  },
  create(data = {}) {
    return http.post('/agent/conversations', data)
  },
  detail(id) {
    return http.get(`/agent/conversations/${id}`)
  },
  update(id, data) {
    return http.patch(`/agent/conversations/${id}`, data)
  },
  remove(id) {
    return http.delete(`/agent/conversations/${id}`)
  }
}

export const agentApi = {
  chatStream,
  supportStream,
  supportReset,
  supportHistory,
  conversations: conversationApi
}
