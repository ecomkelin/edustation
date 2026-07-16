'use strict'

/**
 * 宠物系统平台级配置（2026-07-15 重构：删等阶 C/B/A/S + 删装饰，改多宠 + per-org 等级配置）。
 *
 * 历史：原为 4 阶 (C/B/A/S) 平台硬编码阶表（pet-system-v2, 2026-06-21）。
 * 2026-07-15 重构后：
 *   - 无等阶：所有宠物用同一套等级/经验/喂养数值
 *   - 等级曲线 per-org 可配置（见 PetLevelConfig model）；本文件仅提供默认兜底
 *   - 一个学生可领养多只宠物（MAX_PETS_PER_STUDENT），第一只为默认
 *   - 饱腹度衰减 + 饿死回蛋机制保留（单一速率/阈值，无 tier 差异）
 *
 * 字段语义（PetLevelConfig / 默认）：
 *   - maxLevel:       最大等级（满级后经验封顶，不再升级）
 *   - expBase:        1 级升 2 级所需经验基数
 *   - expIncrement:   每升一级额外增加的经验需求
 *     → expToNext(L) = expBase + expIncrement * (L - 1)
 */
const MAX_HUNGER = 1000
const INIT_HUNGER_AFTER_HATCH = 300

// 每个学生最多领养的宠物数 (2026-07-16 产品决策: 10 → 5)
const MAX_PETS_PER_STUDENT = 5

// per-org 等级配置的默认兜底（无 PetLevelConfig 记录时使用）
const DEFAULT_LEVEL_CONFIG = Object.freeze({
  maxLevel: 12,
  expBase: 100,
  expIncrement: 50
})

// 饱腹度衰减速率（每天扣 N 点）+ 饿死阈值（hunger=0 后多少天未喂即死亡）。
// 单一数值（无 tier 差异）。未来 per-org 化可迁到 PetLevelConfig。
const DEFAULT_HUNGER_DECAY_PER_DAY = 1
const DEFAULT_DEATH_THRESHOLD_DAYS = 30

/**
 * 计算当前等级 L 升到 L+1 所需经验。
 *
 * @param {Number} level - 当前等级（1-based）
 * @param {Object} [cfg] - { maxLevel, expBase, expIncrement }；缺省用 DEFAULT_LEVEL_CONFIG
 * @returns {Number|null} 满级时返回 null
 */
function expToNext(level, cfg) {
  const c = normalizeLevelConfig(cfg)
  if (level >= c.maxLevel) return null // 已满级
  return c.expBase + c.expIncrement * (level - 1)
}

/**
 * 归一化 per-org 等级配置，缺字段用默认兜底。
 */
function normalizeLevelConfig(cfg) {
  const c = cfg || {}
  return {
    maxLevel: Number.isFinite(c.maxLevel) && c.maxLevel > 0 ? c.maxLevel : DEFAULT_LEVEL_CONFIG.maxLevel,
    expBase: Number.isFinite(c.expBase) && c.expBase > 0 ? c.expBase : DEFAULT_LEVEL_CONFIG.expBase,
    expIncrement: Number.isFinite(c.expIncrement) && c.expIncrement >= 0 ? c.expIncrement : DEFAULT_LEVEL_CONFIG.expIncrement
  }
}

// 导出 (CJS + named exports 双形式，与 shared/enums.js 一致)
exports.MAX_HUNGER = MAX_HUNGER
exports.INIT_HUNGER_AFTER_HATCH = INIT_HUNGER_AFTER_HATCH
exports.MAX_PETS_PER_STUDENT = MAX_PETS_PER_STUDENT
exports.DEFAULT_LEVEL_CONFIG = DEFAULT_LEVEL_CONFIG
exports.DEFAULT_HUNGER_DECAY_PER_DAY = DEFAULT_HUNGER_DECAY_PER_DAY
exports.DEFAULT_DEATH_THRESHOLD_DAYS = DEFAULT_DEATH_THRESHOLD_DAYS
exports.expToNext = expToNext
exports.normalizeLevelConfig = normalizeLevelConfig
module.exports = exports
