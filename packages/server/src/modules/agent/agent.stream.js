'use strict'

/**
 * SSE 写入工具 (Server-Sent Events)
 *
 * 事件类型 (前端 useAgentStream composable 按 type 分发):
 *  - start:       { runId, model }
 *  - content:     { delta: string }     累积到助手消息
 *  - tool_call:   { id, name, args, summary?, requiresConfirmation?, requiredPermission? }
 *  - tool_result: { id, name, ok, summary, result | error }
 *  - done:        { usage?, latencyMs?, aborted? }
 *  - error:       { code, message }
 *
 * 注意点:
 *  - 不在 sseWrite 里 try/catch: 由 controller 主循环 catch 后写 error 事件
 *  - res.flushHeaders() 让 Express 立即把 headers 推给客户端
 *  - X-Accel-Buffering=no 防止 nginx 反代缓冲
 */

function sseInit(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  // 让 Express 立即 flush headers (Node 18+ 才有 flushHeaders)
  if (typeof res.flushHeaders === 'function') res.flushHeaders()
}

function sseWrite(res, event, data) {
  res.write(`event: ${event}\n`)
  res.write(`data: ${JSON.stringify(data)}\n\n`)
}

function sseEnd(res) {
  res.end()
}

/**
 * 给 res.on('close') 用: 客户端断连时调用 controller 传入的 abort callback
 */
function onClientClose(req, onAbort) {
  req.on('close', () => {
    try { onAbort && onAbort() } catch (_) {}
  })
}

module.exports = { sseInit, sseWrite, sseEnd, onClientClose }