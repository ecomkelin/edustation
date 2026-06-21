'use strict'

/**
 * 宠物系统平台级阶表（2026-06-21 立项，pet-system-v2）。
 *
 * 所有机构共享同一份阶表；本 MVP 阶段不支持 per-org 调参（D5 决策）。
 * 未来要做 per-org 化：把本表迁到 SiteConfig.in5，加缓存层。
 *
 * 字段语义：
 *   - maxLv:                该阶的最大等级（满级 = maxLv 时升下一阶；S 阶到顶不升）
 *   - expFormula(L):        当前等级 L 升级到 L+1 所需的经验值
 *   - feedCost:             喂食三档的积分成本（normal/premium/super）
 *   - swapCost:             置换蛋的积分成本（保留阶，0 经验）
 *   - decayPerDay:          每天扣多少 currentHunger（高阶扣得多，逼高频学习）
 *   - deathThresholdDays:   hunger=0 后多少天未喂即死亡（高阶更短）
 *
 * 设计原则（C/B/A/S 平衡"积分充裕度"差异）：
 *   - C 阶 normal 喂食只要 5 积分 → 积分少的学生也能养得起
 *   - S 阶 normal 喂食 100 积分 → 积分多的学生有奔头
 *   - 越高级越"难养"：衰减快 + 死亡阈值短，避免"养到 S 后躺平"
 */
const PET_TIER_CONFIG = Object.freeze({
  C: Object.freeze({
    maxLv: 10,
    expFormula: (L) => 50 + L * 20,
    feedCost: Object.freeze({ normal: 5, premium: 15, super: 40 }),
    swapCost: 80,
    decayPerDay: 1,
    deathThresholdDays: 30
  }),
  B: Object.freeze({
    maxLv: 15,
    expFormula: (L) => 80 + L * 30,
    feedCost: Object.freeze({ normal: 15, premium: 40, super: 100 }),
    swapCost: 200,
    decayPerDay: 1,
    deathThresholdDays: 25
  }),
  A: Object.freeze({
    maxLv: 20,
    expFormula: (L) => 120 + L * 50,
    feedCost: Object.freeze({ normal: 40, premium: 100, super: 250 }),
    swapCost: 500,
    decayPerDay: 2,
    deathThresholdDays: 20
  }),
  S: Object.freeze({
    maxLv: 30,
    expFormula: (L) => 200 + L * 80,
    feedCost: Object.freeze({ normal: 100, premium: 250, super: 600 }),
    swapCost: 1000,
    decayPerDay: 3,
    deathThresholdDays: 15
  })
})

/**
 * 计算升到下一级所需经验（封装 expFormula，避免调用方写 tier 边界判断）。
 *
 * @param {String} tier - C / B / A / S
 * @param {Number} level - 当前等级（1-based；满级时返回 null）
 * @returns {Number|null}
 */
function expToNext(tier, level) {
  const cfg = PET_TIER_CONFIG[tier]
  if (!cfg) return null
  if (level >= cfg.maxLv) return null // 已满级
  return cfg.expFormula(level)
}

/**
 * 满级升阶所需经验阈值（maxLv 时累计到这个值触发升阶）。
 * 等价于 expFormula(maxLv)，C=250, B=530, A=1120, S=2600。
 *
 * @param {String} tier
 * @returns {Number|null}
 */
function tierUpExpThreshold(tier) {
  const cfg = PET_TIER_CONFIG[tier]
  if (!cfg) return null
  return cfg.expFormula(cfg.maxLv)
}

/**
 * 给定阶，求下一阶（用于升阶）。S 已是最高。
 *
 * @param {String} tier
 * @returns {String|null} 下一阶 key，不存在时返回 null
 */
function nextTier(tier) {
  const order = ['C', 'B', 'A', 'S']
  const idx = order.indexOf(tier)
  if (idx < 0 || idx === order.length - 1) return null
  return order[idx + 1]
}

/**
 * 给定阶，求所有比它低的阶（用于降阶选项；玩家可选）。
 *
 * @param {String} tier
 * @returns {String[]} 降序排列的更低阶列表
 */
function lowerTiers(tier) {
  const order = ['C', 'B', 'A', 'S']
  const idx = order.indexOf(tier)
  if (idx <= 0) return []
  return order.slice(0, idx)
}

/**
 * 给定阶，校验是否合法。
 */
function isValidTier(tier) {
  return Object.prototype.hasOwnProperty.call(PET_TIER_CONFIG, tier)
}

/**
 * 喂食三档枚举（与 petConfig.feedCost 三档对齐）。
 */
const FOOD_TYPES = Object.freeze(['normal', 'premium', 'super'])
const FOOD_TYPE_LABELS = Object.freeze({
  normal: '普通',
  premium: '高级',
  super: '特级'
})

// 喂食三档的饱腹度 + 经验值（每阶三档独立数值）。
// 设计原则：饱腹度恢复 + 经验值 + 积分成本 三者综合权衡。
// C 阶喂养便宜，经验/饱腹回报也低；S 阶喂养昂贵，回报高（适合积分多/学习频率高的学生）。
const FEED_REWARD = Object.freeze({
  C: Object.freeze({
    normal:  Object.freeze({ exp: 10, hunger: 15 }),
    premium: Object.freeze({ exp: 30, hunger: 40 }),
    super:   Object.freeze({ exp: 80, hunger: 100 })
  }),
  B: Object.freeze({
    normal:  Object.freeze({ exp: 20, hunger: 12 }),
    premium: Object.freeze({ exp: 60, hunger: 35 }),
    super:   Object.freeze({ exp: 160, hunger: 100 })
  }),
  A: Object.freeze({
    normal:  Object.freeze({ exp: 40, hunger: 10 }),
    premium: Object.freeze({ exp: 120, hunger: 30 }),
    super:   Object.freeze({ exp: 320, hunger: 100 })
  }),
  S: Object.freeze({
    normal:  Object.freeze({ exp: 80, hunger: 8 }),
    premium: Object.freeze({ exp: 240, hunger: 25 }),
    super:   Object.freeze({ exp: 640, hunger: 100 })
  })
})

/**
 * 取喂食回报（经验 + 饱腹度恢复）。
 *
 * @param {String} tier
 * @param {String} foodType
 * @returns {{exp: Number, hunger: Number}|null}
 */
function feedReward(tier, foodType) {
  const t = FEED_REWARD[tier]
  if (!t) return null
  return t[foodType] || null
}

// 导出 (CJS + named exports 双形式，与 shared/enums.js 一致)
exports.PET_TIER_CONFIG = PET_TIER_CONFIG
exports.FEED_REWARD = FEED_REWARD
exports.FOOD_TYPES = FOOD_TYPES
exports.FOOD_TYPE_LABELS = FOOD_TYPE_LABELS
exports.expToNext = expToNext
exports.tierUpExpThreshold = tierUpExpThreshold
exports.nextTier = nextTier
exports.lowerTiers = lowerTiers
exports.isValidTier = isValidTier
exports.feedReward = feedReward
module.exports = exports
