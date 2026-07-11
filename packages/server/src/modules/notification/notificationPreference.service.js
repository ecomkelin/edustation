'use strict'

/**
 * 通知偏好服务（v0.9 立项）
 *
 * 设计要点：
 * 1. **懒创建**：首次 publish 时若用户无偏好文档，按 DEFAULT_PREFERENCES 创建
 * 2. **per user per org**：跨机构偏好独立（家长在 A 机构开 lesson，在 B 机构关）
 * 3. **capability 自动派生**：根据 User.wechatUnionId / User.mobile 算 channels.<ch>.capability
 *    用户不可改 capability，仅控制 enabled
 * 4. **PUT 端点白名单**：仅 globalEnabled / categories.* / channels.*.enabled / quietHours 可改
 *
 * 公开 API：
 *   - getOrCreate(orgId, userId)        — 拉偏好；不存在则懒创建并返
 *   - update(orgId, userId, payload)    — 白名单字段更新；触发 capability 重新派生
 *   - computeCapability(user)           — 内部：根据 User 字段派生 5 渠道能力
 *   - isChannelEnabled(prefs, category, channel) — 内部：publish 时综合判定
 */

const NotificationPreference = require('@models/NotificationPreference.model')
const User = require('@models/User.model')

/**
 * 根据 User 字段派生 channels.<ch>.capability
 * - inbox: 永远 true
 * - wechatMini: 绑了 unionId (wechatUnionId 非空) → true
 * - wechatPublic: 同上
 * - sms: 必填 mobile → 永远 true
 * - push: MVP 永远 false（无 UniPush 集成）
 */
function computeCapability(user) {
  if (!user) {
    return { inbox: true, wechatMini: false, wechatPublic: false, sms: false, push: false }
  }
  const hasWechat = !!(user.wechatUnionId && String(user.wechatUnionId).trim())
  const hasMobile = !!(user.mobile && String(user.mobile).trim())
  return {
    inbox: true,
    wechatMini: hasWechat,
    wechatPublic: hasWechat,
    sms: hasMobile,
    push: false
  }
}

/**
 * 拉 / 懒创建偏好文档
 */
async function getOrCreate(orgId, userId) {
  let pref = await NotificationPreference.findOne({ org: orgId, user: userId }).lean()
  if (pref) return pref

  // 懒创建：先拉 User 算 capability
  const user = await User.findById(userId).select('wechatUnionId mobile').lean()
  const cap = computeCapability(user)
  const doc = await NotificationPreference.create({
    org: orgId,
    user: userId,
    channels: {
      inbox:        { enabled: true,  capability: cap.inbox },
      wechatMini:   { enabled: true,  capability: cap.wechatMini },
      wechatPublic: { enabled: false, capability: cap.wechatPublic },
      sms:          { enabled: false, capability: cap.sms },
      push:         { enabled: false, capability: cap.push }
    }
  })
  return doc.toObject()
}

/**
 * 更新偏好（白名单字段）
 */
const ALLOWED_CATEGORIES = ['lesson', 'task', 'order', 'evaluation', 'point', 'pet', 'access', 'system']
const ALLOWED_CHANNELS = ['inbox', 'wechatMini', 'wechatPublic', 'sms', 'push']

async function update(orgId, userId, payload) {
  const pref = await getOrCreate(orgId, userId)
  const $set = {}

  if (typeof payload.globalEnabled === 'boolean') {
    $set.globalEnabled = payload.globalEnabled
  }
  if (payload.categories && typeof payload.categories === 'object') {
    for (const cat of ALLOWED_CATEGORIES) {
      const c = payload.categories[cat]
      if (!c || typeof c !== 'object') continue
      if (typeof c.enabled === 'boolean') {
        $set[`categories.${cat}.enabled`] = c.enabled
      }
      if (Array.isArray(c.channels)) {
        // 过滤白名单 + 必须是字符串
        const filtered = c.channels.filter((x) => typeof x === 'string' && ALLOWED_CHANNELS.includes(x))
        $set[`categories.${cat}.channels`] = filtered
      }
    }
  }
  if (payload.channels && typeof payload.channels === 'object') {
    for (const ch of ALLOWED_CHANNELS) {
      if (ch === 'inbox') continue // inbox.enabled 永远 true，不允许改
      const v = payload.channels[ch]
      if (!v || typeof v !== 'object') continue
      if (typeof v.enabled === 'boolean') {
        $set[`channels.${ch}.enabled`] = v.enabled
      }
    }
  }
  if (payload.quietHours && typeof payload.quietHours === 'object') {
    if (typeof payload.quietHours.enabled === 'boolean') {
      $set['quietHours.enabled'] = payload.quietHours.enabled
    }
    if (typeof payload.quietHours.start === 'string') {
      $set['quietHours.start'] = payload.quietHours.start
    }
    if (typeof payload.quietHours.end === 'string') {
      $set['quietHours.end'] = payload.quietHours.end
    }
  }

  if (Object.keys($set).length === 0) {
    return pref
  }
  $set.updatedAt = new Date()

  const updated = await NotificationPreference.findOneAndUpdate(
    { org: orgId, user: userId },
    { $set },
    { new: true }
  ).lean()
  return updated
}

/**
 * 综合判定：某 category 下某 channel 是否真发
 * - globalEnabled=false → false
 * - category.enabled=false → false
 * - channel.enabled=false → false
 * - channel.capability=false → false
 * - system 类仅 globalEnabled 控制
 */
function isChannelEnabled(prefs, category, channel) {
  if (!prefs || !prefs.globalEnabled) {
    // 仅 inbox 在 globalEnabled=false 时仍可达（但 publish 时本判定返回 false → 渠道跳过）
    // 真正的 inbox 强制入队由 publish 内部处理
    return false
  }
  if (category === 'system') {
    // system 不受 per-category 影响
  } else {
    const catCfg = prefs.categories && prefs.categories[category]
    if (!catCfg || !catCfg.enabled) return false
    if (Array.isArray(catCfg.channels) && !catCfg.channels.includes(channel)) return false
  }
  const chCfg = prefs.channels && prefs.channels[channel]
  if (!chCfg || !chCfg.enabled || !chCfg.capability) return false
  return true
}

/**
 * 用户绑定微信 / 改手机号时调用：刷新 capability
 */
async function refreshCapability(orgId, userId) {
  const user = await User.findById(userId).select('wechatUnionId mobile').lean()
  const cap = computeCapability(user)
  const $set = {}
  for (const ch of ALLOWED_CHANNELS) {
    $set[`channels.${ch}.capability`] = cap[ch]
  }
  $set.updatedAt = new Date()
  await NotificationPreference.updateOne(
    { org: orgId, user: userId },
    { $set },
    { upsert: false }
  )
}

module.exports = {
  getOrCreate,
  update,
  isChannelEnabled,
  computeCapability,
  refreshCapability,
  ALLOWED_CATEGORIES,
  ALLOWED_CHANNELS
}