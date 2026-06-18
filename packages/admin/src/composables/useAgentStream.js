import { useAuthStore } from '@/stores/auth'

/**
 * SSE 消费 composable (绕开 axios 拦截器)
 *
 * 为什么不用 axios:
 *  - axios 默认 timeout 15s, 不支持长连接
 *  - axios response interceptor 会解包 {success, data}, 但 SSE 流是分块事件, 不能解包
 *  - axios 401 自动 refresh 逻辑会在流中途误触发, 污染 LLM 输出
 *  - axios 默认把流式响应当 error 处理 (因为 HTTP 200 但 Content-Type=event-stream)
 *
 * 用法:
 *   const { start, stop, isStreaming } = useAgentStream()
 *   await start({
 *     messages: [...],
 *     attachments: [{fileId, fileName, mime}],
 *     onEvent: (event, data) => { ... }
 *   })
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api/v1'

export function useAgentStream() {
  const auth = useAuthStore()
  const acRef = { current: null }
  const isStreaming = ref(false)
  const error = ref(null)

  async function start({ messages, attachments = [], systemPrompt, temperature, maxTokens, conversationId, onEvent }) {
    if (!auth.accessToken) throw new Error('未登录')
    // 终止上一次流
    acRef.current?.abort()
    const ac = new AbortController()
    acRef.current = ac
    isStreaming.value = true
    error.value = null

    try {
      const resp = await fetch(`${API_BASE}/agent/chat/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${auth.accessToken}`,
          'x-org-id': auth.currentOrgId || ''
        },
        body: JSON.stringify({
          messages,
          attachments,
          systemPrompt,
          temperature,
          maxTokens,
          conversationId
        }),
        signal: ac.signal
      })

      if (!resp.ok) {
        // 尝试解析后端业务错误
        let body = null
        try { body = await resp.json() } catch (_) {}
        const msg = body?.message || `HTTP ${resp.status}`
        const err = new Error(msg)
        err.status = resp.status
        err.body = body
        throw err
      }

      if (!resp.body) {
        throw new Error('SSE 响应无 body')
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buf = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        // SSE: event 之间用 \n\n 分隔
        let idx
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          parseAndDispatch(chunk, onEvent)
        }
      }
    } catch (e) {
      if (e.name === 'AbortError') {
        // 客户端主动 stop, 不算错
      } else {
        error.value = e
        throw e
      }
    } finally {
      isStreaming.value = false
    }
  }

  function stop() {
    acRef.current?.abort()
  }

  return { start, stop, isStreaming, error }
}

function parseAndDispatch(chunk, onEvent) {
  let event = 'message'
  let data = ''
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return
  try {
    const parsed = JSON.parse(data)
    onEvent(event, parsed)
  } catch (_) {
    onEvent(event, data)
  }
}

// re-import ref from Vue for the closure
import { ref } from 'vue'