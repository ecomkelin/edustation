/**
 * Agent API - AI 智能助手
 * R-2803 chat/stream (SSE) / R-2810-2815 conversation CRUD
 * 流式响应: H5 走 XMLHttpRequest + onprogress, 其他走 uni.request 暂不支持
 */
import { storage, StorageKeys } from '@/utils/storage'

const BASE_URL = '/api/v1'

/**
 * 流式 chat - 文本逐段回调
 * @param {Object} opts
 * @param {string} opts.message - 用户消息
 * @param {string} [opts.conversationId]
 * @param {string} [opts.organizationId]
 * @param {(delta: string) => void} opts.onDelta - 增量文本回调
 * @param {(full: string, conversationId?: string) => void} [opts.onDone]
 * @param {(err: Error) => void} [opts.onError]
 */
export function chatStream(opts) {
  const { message, conversationId, organizationId, onDelta, onDone, onError } = opts

  const auth = storage.get(StorageKeys.AUTH)
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream'
  }
  if (auth && auth.accessToken) {
    headers['Authorization'] = `Bearer ${auth.accessToken}`
  }
  if (organizationId) {
    headers['x-org-id'] = organizationId
  }

  const studentId = storage.get(StorageKeys.ACTIVE_STUDENT)
  if (studentId) headers['x-active-student-id'] = studentId

  // H5: 用 fetch + ReadableStream 解析 SSE
  if (typeof fetch !== 'undefined' && typeof ReadableStream !== 'undefined') {
    fetch(`${BASE_URL}/agent/chat/stream`, {
      method: 'POST',
      credentials: 'include',
      headers,
      body: JSON.stringify({ message, conversationId, organizationId })
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
        const reader = response.body.getReader()
        const decoder = new TextDecoder('utf-8')
        let buffer = ''
        let full = ''
        let convId = conversationId
        // SSE 帧分隔符: \n\n
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          let idx
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            // 解析 event: + data: 字段
            let event = 'message'
            let data = ''
            const lines = frame.split('\n')
            for (const line of lines) {
              if (line.startsWith('event:')) event = line.slice(6).trim()
              else if (line.startsWith('data:')) data += line.slice(5).trim()
            }
            if (!data) continue
            try {
              const payload = JSON.parse(data)
              if (event === 'delta' || payload.delta) {
                const d = payload.delta || payload.content || ''
                full += d
                onDelta && onDelta(d)
              } else if (event === 'done' || payload.done) {
                convId = payload.conversationId || payload.id || convId
                onDone && onDone(full, convId)
                return
              } else if (event === 'error' || payload.error) {
                onError && onError(new Error(payload.error || payload.message || '流式错误'))
                return
              }
            } catch (_) {
              // 非 JSON,跳过
            }
          }
        }
        onDone && onDone(full, convId)
      })
      .catch((err) => {
        onError && onError(err)
      })
    return
  }

  // 其他平台 fallback - 走普通 request
  import('./request').then(({ http }) => {
    http
      .post('/agent/chat/stream', { message, conversationId, organizationId })
      .then((res) => {
        const text = res.content || res.message || ''
        onDelta && onDelta(text)
        onDone && onDone(text, res.conversationId)
      })
      .catch((err) => onError && onError(err))
  })
}

/** 会话管理 */
export const conversationApi = {
  list(params = {}) {
    return import('./request').then(({ http }) =>
      http.get('/agent/conversations', { data: params })
    )
  },
  create(data = {}) {
    return import('./request').then(({ http }) => http.post('/agent/conversations', data))
  },
  detail(id) {
    return import('./request').then(({ http }) => http.get(`/agent/conversations/${id}`))
  },
  update(id, data) {
    return import('./request').then(({ http }) => http.patch(`/agent/conversations/${id}`, data))
  },
  remove(id) {
    return import('./request').then(({ http }) => http.delete(`/agent/conversations/${id}`))
  }
}

export const agentApi = {
  chatStream,
  conversations: conversationApi
}