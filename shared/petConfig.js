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
 * 2026-07-16 调整（最高等级由物种控制）：
 *   - maxLevel 从 per-org PetLevelConfig **迁到 PetSpecies**（每个物种自己控制最高等级）
 *   - PetLevelConfig 仅提供经验曲线（expBase / expIncrement + per-level overrides）
 *   - 蛋态无 species / species 缺失时用 DEFAULT_SPECIES_MAX_LEVEL 兜底
 *
 * 2026-07-16 第二期：经验曲线从「公式」升级为「可逐级覆盖」
 *   - 新增 levelExpOverrides: { [level]: expNeeded }（per-org）
 *   - expToNext 优先级：levelExpOverrides[level] > 公式 expBase + expIncrement*(L-1) > 默认
 *   - 没配的等级仍按公式走（保留「删一行不破坏等级」语义）；删完整个表才退到默认
 *
 * 字段语义：
 *   - maxLevel（PetSpecies）: 该物种最大等级（满级后经验封顶，不再升级）
 *   - expBase（PetLevelConfig）: 1 级升 2 级所需经验基数（公式默认值）
 *   - expIncrement（PetLevelConfig）: 每升一级额外增加的经验需求——**产品决策：锁定 300**，机构不再可改，全部走逐级覆盖
 *   - levelExpOverrides（PetLevelConfig）: per-level 覆盖表，按 L 查 exp 需求；缺位走公式
 */
const MAX_HUNGER = 1000
const INIT_HUNGER_AFTER_HATCH = 300

// 每个学生最多领养的宠物数 (2026-07-16 产品决策: 10 → 5)
const MAX_PETS_PER_STUDENT = 5

// 物种最高等级的默认兜底（PetSpecies.maxLevel 缺失 / 蛋态无 species 时用）
const DEFAULT_SPECIES_MAX_LEVEL = 12

// per-org 经验曲线的默认兜底（无 PetLevelConfig 记录时使用；仅经验，maxLevel 已迁到 species）
// 2026-07-16：expIncrement 固定为 300（产品决策：每级增量统一 300，机构不再可改，全部逐级手填覆盖）
const LOCKED_EXP_INCREMENT = 300
const DEFAULT_LEVEL_CONFIG = Object.freeze({
  expBase: 100,
  expIncrement: LOCKED_EXP_INCREMENT,
  levelExpOverrides: Object.freeze({})
})

// 饱腹度衰减速率（每天扣 N 点）+ 饿死阈值（hunger=0 后多少天未喂即死亡）。
// 单一数值（无 tier 差异）。未来 per-org 化可迁到 PetLevelConfig。
const DEFAULT_HUNGER_DECAY_PER_DAY = 1
const DEFAULT_DEATH_THRESHOLD_DAYS = 30

/**
 * 计算当前等级 L 升到 L+1 所需经验。
 * 优先级：levelExpOverrides[level] > 公式（expBase + expIncrement*(L-1)）> DEFAULT_LEVEL_CONFIG。
 *
 * @param {Number} level - 当前等级（1-based）
 * @param {Object} [cfg] - { maxLevel, expBase, expIncrement, levelExpOverrides }
 *   - maxLevel 来自 PetSpecies（缺省 DEFAULT_SPECIES_MAX_LEVEL）
 *   - expBase/expIncrement/levelExpOverrides 来自 PetLevelConfig（缺省 DEFAULT_LEVEL_CONFIG）
 * @returns {Number|null} 满级时返回 null；缺级时不会返回 null
 */
function expToNext(level, cfg) {
  const c = cfg || {}
  const maxLevel = Number.isFinite(c.maxLevel) && c.maxLevel > 0 ? c.maxLevel : DEFAULT_SPECIES_MAX_LEVEL
  if (level >= maxLevel) return null // 已满级

  // 1) 显式覆盖优先
  const overrides = c.levelExpOverrides || {}
  const overrideKeys = Object.keys(overrides)
  if (overrideKeys.length > 0) {
    const ovr = overrides[String(level)] ?? overrides[level]
    if (Number.isFinite(ovr) && ovr > 0) return ovr
  }

  // 2) 公式兜底
  const curve = normalizeLevelConfig(c)
  return curve.expBase + curve.expIncrement * (level - 1)
}

/**
 * 归一化 per-org 经验曲线（expBase / expIncrement / levelExpOverrides，maxLevel 已迁到 species）。
 * 注意：expIncrement 已锁定（LOCKED_EXP_INCREMENT=300），忽略 DB / 入参里的任何不一致值。
 */
function normalizeLevelConfig(cfg) {
  const c = cfg || {}
  const out = {
    expBase: Number.isFinite(c.expBase) && c.expBase > 0 ? c.expBase : DEFAULT_LEVEL_CONFIG.expBase,
    expIncrement: LOCKED_EXP_INCREMENT, // 锁定，忽略入参 + DB 旧值
    levelExpOverrides: normalizeLevelOverrides(c.levelExpOverrides)
  }
  return out
}

/**
 * 把各种形状的覆盖表归一为 `{ '1': 100, '2': 200 }` 字符串键字典（仅保留 > 0 的正整数经验值）。
 * 接受：Map / 普通对象 / 数组 [{level, exp}]。
 */
function normalizeLevelOverrides(input) {
  if (!input) return {}
  if (input instanceof Map) {
    input = Object.fromEntries(input)
  }
  if (Array.isArray(input)) {
    const out = {}
    for (const entry of input) {
      if (!entry) continue
      const lvl = Number(entry.level)
      const exp = Number(entry.exp ?? entry.need)
      if (Number.isFinite(lvl) && lvl >= 1 && Number.isFinite(exp) && exp > 0) {
        out[String(lvl)] = exp
      }
    }
    return out
  }
  if (typeof input === 'object') {
    const out = {}
    for (const k of Object.keys(input)) {
      const lvl = Number(k)
      const exp = Number(input[k])
      if (Number.isFinite(lvl) && lvl >= 1 && Number.isFinite(exp) && exp > 0) {
        out[String(lvl)] = exp
      }
    }
    return out
  }
  return {}
}

/**
 * 把覆盖表序列化为前端可编辑的数组 `[{ level, exp }, ...]`（按 level 升序）。
 */
function levelOverridesToRows(overrides) {
  const o = normalizeLevelOverrides(overrides)
  return Object.keys(o)
    .map(k => ({ level: Number(k), exp: o[k] }))
    .sort((a, b) => a.level - b.level)
}

/**
 * 从前端可编辑行 `[{ level, exp }, ...]` 反序列化为覆盖表。
 */
function rowsToLevelOverrides(rows) {
  if (!Array.isArray(rows)) return {}
  const out = {}
  for (const row of rows) {
    if (!row) continue
    const lvl = Number(row.level)
    const exp = Number(row.exp)
    if (Number.isFinite(lvl) && lvl >= 1 && Number.isFinite(exp) && exp > 0) {
      out[String(lvl)] = exp
    }
  }
  return out
}

/**
 * 解析某物种的最高等级（PetSpecies.maxLevel，缺省兜底 DEFAULT_SPECIES_MAX_LEVEL）。
 * @param {Object|null} species - PetSpecies 记录（含 maxLevel）
 */
function resolveMaxLevel(species) {
  const m = species && species.maxLevel
  return Number.isFinite(m) && m > 0 ? m : DEFAULT_SPECIES_MAX_LEVEL
}

// 导出 (CJS + named exports 双形式，与 shared/enums.js 一致)
exports.MAX_HUNGER = MAX_HUNGER
exports.INIT_HUNGER_AFTER_HATCH = INIT_HUNGER_AFTER_HATCH
exports.MAX_PETS_PER_STUDENT = MAX_PETS_PER_STUDENT
exports.DEFAULT_SPECIES_MAX_LEVEL = DEFAULT_SPECIES_MAX_LEVEL
exports.LOCKED_EXP_INCREMENT = LOCKED_EXP_INCREMENT
exports.DEFAULT_LEVEL_CONFIG = DEFAULT_LEVEL_CONFIG
exports.DEFAULT_HUNGER_DECAY_PER_DAY = DEFAULT_HUNGER_DECAY_PER_DAY
exports.DEFAULT_DEATH_THRESHOLD_DAYS = DEFAULT_DEATH_THRESHOLD_DAYS
exports.expToNext = expToNext
exports.normalizeLevelConfig = normalizeLevelConfig
exports.normalizeLevelOverrides = normalizeLevelOverrides
exports.levelOverridesToRows = levelOverridesToRows
exports.rowsToLevelOverrides = rowsToLevelOverrides
exports.resolveMaxLevel = resolveMaxLevel
module.exports = exports
