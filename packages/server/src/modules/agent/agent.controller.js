'use strict'

const s = require('./agent.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * POST /agent/chat
 * Body: {
 *   messages: [{role:'user'|'assistant'|'system', content:string}],
 *   systemPrompt?: string,        // 临时系统提示（可选）
 *   knowledgeContext?: string,    // RAG 知识片段（可选）
 *   temperature?: number,         // 0-2
 *   maxTokens?: number            // 上限
 * }
 */
exports.chat = async (req, res) =>
  res.json(
    ApiResponse.ok(
      await s.chat({
        messages: req.body.messages,
        systemPrompt: req.body.systemPrompt,
        knowledgeContext: req.body.knowledgeContext,
        temperature: req.body.temperature,
        maxTokens: req.body.maxTokens
      })
    )
  )

/**
 * GET /agent/ping
 * 用于「AI 客服测试」页一键验证 provider 可用性。
 * 不需要任何参数。
 */
exports.ping = async (req, res) => {
  const result = await s.ping()
  // 即便 ping 失败，也以 200 返回 ok=false，由前端展示原因。
  // 这样前端能根据 ok 字段决定 UI 状态（绿勾/红叉），不会被全局 4xx/5xx 弹窗吞掉。
  res.json(ApiResponse.ok(result))
}
