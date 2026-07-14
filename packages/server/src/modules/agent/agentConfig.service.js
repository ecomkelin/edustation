'use strict'

const AgentConfig = require('@models/AgentConfig.model')
const config = require('@config/index')

const UPDATABLE_FIELDS = ['systemPrompt', 'temperature', 'maxTokens']

/**
 * env 兜底: DB 无行或字段为空时, 从 config.ai.* 取 system-default 三元组.
 * config.ai.* 来源: packages/server/src/config/index.js, 受 AI_* 环境变量控制.
 */
function getEnvDefaults () {
  const ai = config.ai || {}
  return {
    systemPrompt: ai.systemPrompt || '',
    temperature: typeof ai.temperature === 'number' ? ai.temperature : 0.3,
    maxTokens: typeof ai.maxTokens === 'number' ? ai.maxTokens : 2048
  }
}

/** 启动时调用: DB 无行则塞一条空文档 (后续 read 才走 env-fallback) */
async function ensureSingleton () {
  const exists = await AgentConfig.findOne({ scope: 'global' }).select('_id').lean()
  if (exists) return { status: 'exists' }
  await AgentConfig.create({ scope: 'global' })
  // eslint-disable-next-line no-console
  console.log('[agent-config] singleton created')
  return { status: 'created' }
}

/**
 * 业务层读 — DB-first, env-fallback.
 * 返回值永远存在 (不会 null/undefined); 缺字段时 env 填; env 也缺时硬编码 default.
 */
async function resolveEffective () {
  const doc = await AgentConfig.findOne({ scope: 'global' }).lean()
  const env = getEnvDefaults()
  return {
    systemPrompt: (doc && doc.systemPrompt) || env.systemPrompt || '',
    temperature: (doc && typeof doc.temperature === 'number') ? doc.temperature : env.temperature,
    maxTokens: (doc && typeof doc.maxTokens === 'number') ? doc.maxTokens : env.maxTokens
  }
}

/** GET 端点用 — 返 DB 行 (含 _id / timestamps); DB 无行时返「空 + env 默认」展示态 */
async function get () {
  const doc = await AgentConfig.findOne({ scope: 'global' }).lean()
  if (doc) return doc
  const env = getEnvDefaults()
  return {
    scope: 'global',
    systemPrompt: '',
    temperature: env.temperature,
    maxTokens: env.maxTokens
  }
}

/**
 * PUT 端点用 — 只更新 payload 里出现的字段; 数值字段强制 Number; 空 set 时不写库.
 * upsert + setDefaultsOnInsert 保证 DB 无行时也写一条.
 */
async function update (payload) {
  const set = {}
  for (const k of UPDATABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      if (k === 'systemPrompt') set[k] = String(payload[k] || '')
      else set[k] = Number(payload[k])
    }
  }
  if (Object.keys(set).length === 0) return get()
  return await AgentConfig.findOneAndUpdate(
    { scope: 'global' },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
  ).lean()
}

module.exports = {
  ensureSingleton,
  resolveEffective,
  get,
  update,
  UPDATABLE_FIELDS
}