'use strict'

/**
 * 通知模板服务（v0.9 立项）
 *
 * 设计要点：
 * 1. **org=null = 平台默认模板**；机构自定义时 org 非 null
 * 2. **查找策略**：优先机构自定义 > 平台默认；任一均无 → 走 publish 时 inline fallback
 * 3. **占位符渲染**：白名单字段（studentName / courseName / time / room / teacherName）；
 *    严禁渲染敏感字段（idCard / cardNumber / passwordHash）
 * 4. **多渠道**：MVP 仅 inbox；wechatMini/sms 模板字段留位 P2/P3 启用
 *
 * 公开 API：
 *   - getTemplate(orgId, type, channel)   — 查找模板（机构 > 平台默认）
 *   - render(template, vars)               — 渲染占位符
 *   - list(orgId)                          — 管理后台列表（机构 + 平台默认合并）
 *   - upsert(orgId, type, channel, body)   — 新增 / 编辑模板
 *   - listActiveTypes()                    — 列出所有 isActive=true 的 type（管理后台枚举）
 */

const NotificationTemplate = require('@models/NotificationTemplate.model')

// 占位符白名单（按 CLAUDE.md §"v0.9 推送通知" plan §11.1 隐私红线）
const PLACEHOLDER_KEYS = new Set([
  'studentName',
  'courseName',
  'time',
  'endTime',
  'room',
  'teacherName',
  'orgName',
  'orderNo',
  'amount',
  'points',
  'days',
  'reason'
])

/**
 * 拉取模板：先查机构自定义，再 fallback 平台默认
 */
async function getTemplate(orgId, type, channel = 'inbox') {
  if (!type) return null
  // 机构自定义
  let tpl = await NotificationTemplate.findOne({
    org: orgId,
    type,
    channel,
    isActive: true
  }).lean()
  if (tpl) return tpl
  // 平台默认
  tpl = await NotificationTemplate.findOne({
    org: null,
    type,
    channel,
    isActive: true
  }).lean()
  return tpl
}

/**
 * 占位符渲染：仅替换白名单 key；vars 里其他字段忽略
 *   {studentName} → vars.studentName（未提供则保留占位符原文，便于排查）
 */
function render(template, vars) {
  if (!template || typeof template !== 'object') return { title: '', body: '' }
  const safeVars = {}
  if (vars && typeof vars === 'object') {
    for (const k of Object.keys(vars)) {
      if (PLACEHOLDER_KEYS.has(k)) safeVars[k] = vars[k]
    }
  }
  const replace = (s) => {
    if (!s || typeof s !== 'string') return s
    return s.replace(/\{(\w+)\}/g, (m, key) => {
      if (Object.prototype.hasOwnProperty.call(safeVars, key)) {
        const v = safeVars[key]
        return v === null || v === undefined ? '' : String(v)
      }
      return m // 未提供：保留原文
    })
  }
  return {
    title: replace(template.title),
    body: replace(template.body)
  }
}

/**
 * 管理后台列表：合并机构自定义 + 平台默认（机构优先）
 */
async function list(orgId) {
  const [orgTemplates, platformTemplates] = await Promise.all([
    NotificationTemplate.find({ org: orgId }).sort({ type: 1, channel: 1 }).lean(),
    NotificationTemplate.find({ org: null }).sort({ type: 1, channel: 1 }).lean()
  ])
  // 合并：机构覆盖平台默认（同 type+channel 时机构优先）
  const merged = new Map()
  for (const t of platformTemplates) merged.set(`${t.type}__${t.channel}`, { ...t, source: 'platform' })
  for (const t of orgTemplates) merged.set(`${t.type}__${t.channel}`, { ...t, source: 'org' })
  return Array.from(merged.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type)
    return a.channel.localeCompare(b.channel)
  })
}

/**
 * 新增 / 编辑模板（按 org+type+channel unique upsert）
 */
async function upsert(orgId, type, channel, payload) {
  const doc = await NotificationTemplate.findOneAndUpdate(
    { org: orgId, type, channel },
    {
      $set: {
        org: orgId,
        type,
        channel,
        title: payload.title,
        body: payload.body,
        wechatTemplateId: payload.wechatTemplateId || null,
        smsTemplateCode: payload.smsTemplateCode || null,
        isActive: payload.isActive !== false
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean()
  return doc
}

/**
 * 列出所有启用模板的 type（管理后台枚举，供管理员"添加模板"下拉用）
 */
async function listActiveTypes() {
  const docs = await NotificationTemplate.find({ isActive: true }).select('type channel').lean()
  const map = new Map()
  for (const d of docs) {
    if (!map.has(d.type)) map.set(d.type, new Set())
    map.get(d.type).add(d.channel)
  }
  return Array.from(map.entries()).map(([type, channels]) => ({
    type,
    channels: Array.from(channels).sort()
  }))
}

module.exports = {
  getTemplate,
  render,
  list,
  upsert,
  listActiveTypes,
  PLACEHOLDER_KEYS
}