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
const ApiError = require('@utils/ApiError')

// 占位符白名单（按 CLAUDE.md §"v0.9 推送通知" plan §11.1 隐私红线）
// 2026-07-13: 加 5 个任务触发点占位符 (task_assigned / rejected / approved / cancelled)
//   + 1 个 lesson_preparing 复用 courseName/time/room
//   严禁渲染敏感字段 (idCard / cardNumber / passwordHash), 不在这里加
const PLACEHOLDER_KEYS = new Set([
  // 已有 (lesson_prepare_reminder / task_due)
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
  'reason',
  // 2026-07-13 新增 — 任务触发点
  'taskTitle',       // 任务标题 (替 task_due 的 {reason}, 但保留 {reason} 兼容)
  'actorName',       // 操作人姓名 (指派 / 审批 / 取消 的人, 通用)
  'comment',         // 审批意见 / 取消原因 (task_rejected / task_cancelled)
  'score',           // 审批打分 (task_rejected / task_approved 可选)
  'dueAt',           // 截止时间 (task_assigned 友好文本, 替 task_due 的 {time})
  'priority'         // 优先级 (task_assigned 可选)
])

/**
 * 拉取模板 (v4 2026-07-18: org-only)
 *
 * 之前: 先查机构自定义，再 fallback 平台默认 — 新机构没自定义时, 默认就走平台默认,
 *   等于「未启用也照发通知」, 跟用户「不启用则不发」语义不符.
 * 现在: 只查本机构 org 副本.
 *   - 找到 → 返回 (不论 isActive, 交给 publish 判断)
 *   - 找不到 → 返回 null → publish skipped (通知不发)
 *
 * 「平台默认」仅用于:
 *   1. list 接口返给 UI 用于展示"如果启用会长什么样" (预览文案)
 *   2. toggle 启用本机构时, 作为新 org 副本的初始文案 (一键复制)
 *
 * 不再参与 publish 决策路径.
 */
async function getTemplate(orgId, type, channel = 'inbox') {
  if (!type) return null
  const tpl = await NotificationTemplate.findOne({
    org: orgId,
    type,
    channel
  }).lean()
  return tpl || null
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
 * 管理后台列表：合并机构自定义 + 平台默认（**两条都返**, UI 自决显示)
 *
 * 2026-07-18 重构: 之前 Map 合并时机构版直接覆盖 platform, 平台默认那条永远不返,
 *   导致 UI 上"本机构开关"看起来跟"平台默认"是同一个开关, 用户实际关闭后
 *   publish 仍走 platform fallback 继续发送. 现在两条都返, UI 区分显示.
 *
 * 返回结构: Array<{ type, channel, org: doc|null, platform: doc|null, effective: 'org'|'platform'|'none' }>
 *   - org 有 → effective='org' (本机构覆盖生效)
 *   - org 无 + platform 有 → effective='platform' (走平台默认)
 *   - 都没有 → effective='none' (publish 时走 type 兜底)
 */
async function list(orgId) {
  const [orgTemplates, platformTemplates] = await Promise.all([
    NotificationTemplate.find({ org: orgId }).sort({ type: 1, channel: 1 }).lean(),
    NotificationTemplate.find({ org: null }).sort({ type: 1, channel: 1 }).lean()
  ])
  // 索引化
  const orgMap = new Map(orgTemplates.map((t) => [`${t.type}__${t.channel}`, t]))
  const platformMap = new Map(platformTemplates.map((t) => [`${t.type}__${t.channel}`, t]))
  // key 合并: org ∪ platform 的 key 集
  const allKeys = new Set([...orgMap.keys(), ...platformMap.keys()])
  const result = []
  for (const k of allKeys) {
    const org = orgMap.get(k) || null
    const platform = platformMap.get(k) || null
    const effective = org ? 'org' : (platform ? 'platform' : 'none')
    const [type, channel] = k.split('__')
    result.push({ type, channel, org, platform, effective })
  }
  return result.sort((a, b) => {
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
 * 重置机构自定义 → 回退平台默认 (2026-07-14 新增)
 *
 * 删除当前 org 在 (type, channel) 上的覆盖行; publish 查找时会自然降级到平台默认行。
 * 幂等: 没有任何 org 自定义时返回 deleted=0, 不报错。
 */
async function removeOrgOverride(orgId, type, channel) {
  const r = await NotificationTemplate.deleteOne({
    org: orgId,
    type,
    channel
  })
  return { deleted: r.deletedCount || 0 }
}

/**
 * 批量重置: 一次性清空机构所有 org 自定义模板 (2026-07-14 新增)
 *
 * 用途: admin Templates UI "全部重置" 按钮, 一次回到所有平台默认。
 * 幂等: 即便一条都没自定义过, 也返 deleted=0 不报错。
 * 重要: 这是不可逆操作 (destroy 所有本机构覆盖), 必须前端二次 confirm。
 */
async function removeAllOrgOverrides(orgId) {
  const r = await NotificationTemplate.deleteMany({ org: orgId })
  return { deleted: r.deletedCount || 0 }
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

/**
 * 平台超管: 切换平台默认模板 isActive (2026-07-18 新增)
 *
 * 重要: 这个操作影响**所有未自定义本机构覆盖**的机构 (即所有走平台默认的机构).
 * 必须 requirePlatformAdmin 才能调.
 *
 * 场景: 平台超管在管理后台看到 7 条平台默认模板, 想批量/单个停用某条.
 *       也支持改 title/body (重置全平台文案).
 */
async function upsertPlatform(type, channel, payload) {
  if (!type || !channel) throw ApiError.badRequest('type/channel 必填')
  // upsert org=null (平台默认)
  const doc = await NotificationTemplate.findOneAndUpdate(
    { org: null, type, channel },
    {
      $set: {
        org: null,
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

module.exports = {
  getTemplate,
  render,
  list,
  upsert,
  upsertPlatform,
  removeOrgOverride,
  removeAllOrgOverrides,
  listActiveTypes,
  PLACEHOLDER_KEYS
}