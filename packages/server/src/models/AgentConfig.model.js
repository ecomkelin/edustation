'use strict'

const { Schema, model } = require('mongoose')

/**
 * AI 助手平台级配置 (AgentConfig)
 *
 * 2026-07-14 立项: 3 个 LLM 调用参数 (systemPrompt/temperature/maxTokens) 由平台超管统一设置,
 *   客户端 AiAssistant 不再传这 3 个字段, 全部走本表.
 *   - scope='global' unique 单例锁 (整个 SaaS 一份, 复用 SiteConfig 范式)
 *   - GET /agent/config 公开给登录用户 (未来 debug 用)
 *   - PUT /agent/config requirePlatformAdmin
 *
 * DB 无行时, agent.service.resolveEffective 走 config/index.js 的 ai.* 兜底.
 */
const AgentConfigSchema = new Schema(
  {
    // 单例锁: scope='global' unique, 整个数据库只有一条
    scope: { type: String, default: 'global', unique: true, immutable: true },

    systemPrompt: { type: String, default: '' },
    temperature: { type: Number, default: 0.3, min: 0, max: 2 },
    maxTokens: { type: Number, default: 2048, min: 256, max: 8000 }
  },
  { timestamps: true, collection: 'agent_configs' }
)

module.exports = model('AgentConfig', AgentConfigSchema)