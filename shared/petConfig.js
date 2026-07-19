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
 * 2026-07-16 第三期：PetSpecies 视觉按等级覆盖
 *   - PetSpecies 加 levelVisuals[]（per-species 逐级形象覆盖；空数组 → 全部等级用 species 视觉字段）
 *   - resolveVisualAtLevel(species, level) 走 fallback 链：species.levelVisuals[level] → species.levelVisuals[level-1] → ... → species 视觉字段
 *   - 1 级必须有效（要么 levelVisuals[1] 有，要么 species 自身有 visual）—— seed 保证 species 必有
 *
 * 2026-07-18：删 PetSpecies.maxLevel 字段
 *   - 最高等级完全由 species.levelVisuals[].max(level) 派生；空数组时 fallback DEFAULT_SPECIES_MAX_LEVEL
 *   - 每级形象列表本身已描述支持到多少级 → 单独 maxLevel 字段冗余
 *   - resolveMaxLevel(species) 改成从 levelVisuals 派生；调用方零改动
 *
 * 2026-07-18 第四期：升级特效 (levelUpEffect)
 *   - 在 levelVisuals[] 每条子文档里嵌可选的 levelUpEffect {visualType, svgContent, videoFile}
 *   - 跟 resolveVisualAtLevel 对称：resolveLevelUpEffectAtLevel(species, level) → 当前等级升级时播放的特效
 *   - 语义区别：形象 = 持续循环状态 (有 fallback 链)，特效 = 瞬时事件 (无 fallback；未配 = 无特效)
 *
 * 2026-07-18 第五期：蛋态视觉复用物种本体
 *   - 蛋态不再用纯 emoji (🥚) 占位，改用 species 自身视觉字段作为底层
 *   - resolveEggVisual(species) 直接取 species.{visualType, svgContent, videoFile}, 不走 fallback 链
 *   - emoji 保留作为左上角半透明 overlay (产品决策 2026-07-18: 保留 emoji 标识)
 *   - 破壳动画 (锤击+裂纹+金光) 保留
 *
 * 2026-07-18 第三期：DEFAULT_SPECIES_MAX_LEVEL 从 12 改为 1
 *   - 旧: 空数组 → 12 级兜底 (用户「新建物种没配 levelVisuals 默认就有 12 级可升」不合理)
 *   - 新: 空数组 → 1 级 (物种默认就是破壳后 1 级, 不配 levelVisuals 就不能升级, 必须显式配)
 *   - 语义对齐产品决策: 「没配就是蛋态默认」, 升级必须显式开
 *
 * 字段语义：
 *   - expBase（PetLevelConfig）: 1 级升 2 级所需经验基数（公式默认值）
 *   - expIncrement（PetLevelConfig）: 每升一级额外增加的经验需求——**产品决策：锁定 300**，机构不再可改，全部走逐级覆盖
 *   - levelExpOverrides（PetLevelConfig）: per-level 覆盖表，按 L 查 exp 需求；缺位走公式
 *   - levelVisuals（PetSpecies）: per-level 形象覆盖，按 L 查 visual；缺位向上递归 fallback 到 species 视觉字段
 */
const MAX_HUNGER = 1000
const INIT_HUNGER_AFTER_HATCH = 300

// 每个学生最多领养的宠物数 (2026-07-16 产品决策: 10 → 5)
const MAX_PETS_PER_STUDENT = 5

// 物种最高等级的默认兜底（PetSpecies.levelVisuals=[] / 蛋态无 species 时用）
// 2026-07-18 第三期: 默认 1 级 — 没配 levelVisuals 时物种保持初始状态，不能升级。
// 必须显式在「各等级形象」section 添加 ≥2 条才能让宠物升到 ≥2 级。
const DEFAULT_SPECIES_MAX_LEVEL = 1

// per-org 经验曲线的默认兜底（无 PetLevelConfig 记录时使用；仅经验，最高等级已迁到 species.levelVisuals）
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
 *   - maxLevel 由调用方传入（推荐 = resolveMaxLevel(speciesRecord)，缺省 DEFAULT_SPECIES_MAX_LEVEL）
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
 * 解析某物种的最高等级（2026-07-18: 由 species.levelVisuals[].max(level) 派生，
 * 缺省/空数组时 fallback DEFAULT_SPECIES_MAX_LEVEL=1）。
 *
 * 旧版：直接读 PetSpecies.maxLevel → 12。
 * 新版：levelVisuals 数组本身就是「支持到多少级」的描述，每条 levelVisuals.level
 *   表示该物种在那个等级有自定义形象。
 *
 * 2026-07-18 第三期：默认 1 级而非 12 级
 *   - 没配任何 levelVisuals → 物种默认 1 级（破壳后保持 Lv.1，不能升级）
 *   - 配了 N 条 → 最高等级 = max(levelVisuals[].level)
 *   - 必须显式配置 ≥2 条 levelVisuals 才能让宠物升到 ≥2 级
 *
 * @param {Object|null} species - PetSpecies 记录（含 levelVisuals[]）
 * @returns {number} >= 1
 */
function resolveMaxLevel(species) {
  const lvs = species && Array.isArray(species.levelVisuals) ? species.levelVisuals : []
  let max = DEFAULT_SPECIES_MAX_LEVEL  // 默认 1（2026-07-18 第三期：从 0 改为 1）
  for (const v of lvs) {
    if (!v) continue
    const lv = Number(v.level)
    if (Number.isFinite(lv) && lv > max) max = lv
  }
  return max
}

/**
 * 把 PetSpecies.levelVisuals[] 数组转成 `{ '1': vObj, '3': vObj }` 字典方便查找。
 * 同 level 重复时保留首条（schema 上 unique 索引已防，写代码兜底）。
 *
 * @param {Array} levelVisuals - PetSpecies.levelVisuals 子文档数组
 * @returns {Object<string, Object>} { '1': {level,visualType,svgContent,videoFile}, ... }
 */
function getOverrideMap(levelVisuals) {
  const out = {}
  if (!Array.isArray(levelVisuals)) return out
  for (const v of levelVisuals) {
    if (!v) continue
    const lv = Number(v.level)
    if (!Number.isFinite(lv) || lv < 1) continue
    const k = String(lv)
    if (out[k]) continue // 保留首条
    out[k] = v
  }
  return out
}

/**
 * 解析某物种在某等级的形象（含 fallback 链）。
 * 优先级：species.levelVisuals[level] → species.levelVisuals[level-1] → ... → species.levelVisuals[1] → species 视觉字段。
 *
 * @param {Object|null} speciesRecord - PetSpecies 记录（visualType / svgContent / videoFile / levelVisuals）
 * @param {Number} level - 当前等级
 * @returns {{visualType: string, svgContent: string|null, videoFile: Object|string|null,
 *            source: 'override'|'species', level: number}}
 *   - source: 'override' = 命中 species.levelVisuals 的某条；'species' = 落到 species 视觉字段
 *   - level: 命中的等级（source='override' 时为 levelVisuals[] 的 key；source='species' 时为 0）
 *   - 找不到任何 visual（理论不可能，seed 保证 species 必有）→ 返回 video+null 占位
 */
/**
 * 解析「蛋态」底层视觉 (2026-07-18 第五期: 蛋态复用物种本体视觉)
 *
 * 与 resolveVisualAtLevel 的关键区别:
 *   - 蛋态不走 fallback 链, 直接取 species 自身视觉字段 ({visualType, svgContent, videoFile})
 *   - 即便 Lv.1 配了 override, 蛋态**不**用 — 蛋没"等级"概念, 一直展示物种本体风格
 *
 * 设计动机 (2026-07-18):
 *   - 原蛋态用 🥚 emoji 占位, 视觉风格与破壳后完全割裂
 *   - 改用 species 本体视频/svg → 破壳前后视觉一致, 玩家提前感受物种风格
 *   - emoji 缩小作为左上角半透明 overlay, 保留"未破壳"状态标识
 *   - 破壳动画 (锤击+裂纹+金光) 保留, 仪式感不变
 *
 * @param {Object|null} speciesRecord - PetSpecies 记录 (含 visualType/svgContent/videoFile)
 * @returns {{visualType: string, svgContent: string|null, videoFile: Object|string|null}|null}
 *   - 返回 null 表示该物种无视觉配置 (前端走 fallback: emoji + 物种 emoji)
 *   - 否则返回结构与 currentVisual 同 schema, 前端可复用同一渲染分支
 */
function resolveEggVisual(speciesRecord) {
  if (!speciesRecord) return null
  return {
    visualType: speciesRecord.visualType || 'video',
    svgContent: speciesRecord.svgContent || null,
    videoFile: speciesRecord.videoFile || null
  }
}

function resolveVisualAtLevel(speciesRecord, level) {
  const target = Math.max(1, Math.floor(Number(level) || 1))
  const overrides = (speciesRecord && speciesRecord.levelVisuals) || []
  const map = getOverrideMap(overrides)

  // 从 target 向下走 fallback 链（脏数据 visualType+内容不匹配 → 继续向上找）
  for (let lv = target; lv >= 1; lv--) {
    const ovr = map[String(lv)]
    if (!ovr) continue
    if (ovr.visualType === 'svg' && ovr.svgContent) {
      return { visualType: 'svg', svgContent: ovr.svgContent, videoFile: null, source: 'override', level: lv }
    }
    if (ovr.visualType === 'video' && ovr.videoFile) {
      return { visualType: 'video', svgContent: null, videoFile: ovr.videoFile, source: 'override', level: lv }
    }
    // 脏数据：visualType 与内容不符 → 继续向上递归
  }

  // fallback 到 species 视觉字段
  if (speciesRecord) {
    return {
      visualType: speciesRecord.visualType || 'video',
      svgContent: speciesRecord.svgContent || null,
      videoFile: speciesRecord.videoFile || null,
      source: 'species',
      level: 0
    }
  }
  // 理论不可能 — seed 保证 species 必有视觉；兜底返回 video+null 引导上层走 emoji fallback
  return { visualType: 'video', svgContent: null, videoFile: null, source: 'species', level: 0 }
}

/**
 * 解析某物种在「升级到指定 level」时应播放的升级特效（2026-07-18 第四期）。
 *
 * 与 resolveVisualAtLevel 的关键区别：
 *   - 形象 (visual) 是「持续循环状态」，有 fallback 链（levelVisuals[L] → L-1 → ... → species）
 *   - 特效 (effect) 是「瞬时事件」，**没有 fallback**：未在 levelVisuals[L].levelUpEffect 配 = 升级时不播
 *   - 为什么不递归 fallback：升级是单次事件，从 L-1 → L 的跃迁发生在那一刻；
 *     若 L 没配，回退到 L-1 的特效语义混乱（用户期望升到 L，但看到的是 L-1 的"上一段"动画）
 *
 * 触发场景：
 *   - pet.service.feed 一次跨 N 级时：循环调用 resolveLevelUpEffectAtLevel(species, fromLevel+1)
 *     ...species, newLevel)，把非空的 effect 按 fromLevel 升序拼成 levelUpEffects[] 返回前端串行播放
 *   - PetAccount.decoratePet 也调一次（pet.level 当前的升级特效，用于课堂展示 / 列表预览等场景）
 *
 * @param {Object|null} speciesRecord - PetSpecies 记录（含 levelVisuals[].levelUpEffect）
 * @param {Number} level - 升级到的目标等级（1-based；与 levelVisuals[].level 对应）
 * @returns {{visualType: string, svgContent: string|null, videoFile: Object|string|null,
 *            level: number}|null}
 *   - 返回 null 表示该等级无升级特效（前端不播）
 *   - 否则返回完整 effect 结构（与 currentVisual 同 schema，可直接复用渲染分支）
 *   - level 字段返回入参 target level（即使是 species 兜底也没用，因为 effect 没有 fallback）
 */
function resolveLevelUpEffectAtLevel(speciesRecord, level) {
  if (!speciesRecord) return null
  const target = Math.max(1, Math.floor(Number(level) || 1))
  const map = getOverrideMap(speciesRecord.levelVisuals || [])
  const entry = map[String(target)]
  if (!entry) return null  // 该等级没配 levelVisuals → 自然无 effect
  const eff = entry.levelUpEffect
  if (!eff || typeof eff !== 'object') return null  // 配了 visual 但没配 effect
  if (eff.visualType === 'svg' && eff.svgContent) {
    return { visualType: 'svg', svgContent: eff.svgContent, videoFile: null, level: target }
  }
  if (eff.visualType === 'video' && eff.videoFile) {
    return { visualType: 'video', svgContent: null, videoFile: eff.videoFile, level: target }
  }
  return null  // 脏数据 visualType+内容不匹配 → 视为未配
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
exports.getOverrideMap = getOverrideMap
exports.resolveVisualAtLevel = resolveVisualAtLevel
exports.resolveLevelUpEffectAtLevel = resolveLevelUpEffectAtLevel
exports.resolveEggVisual = resolveEggVisual
module.exports = exports
