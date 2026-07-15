'use strict'

/**
 * 宠物种类图鉴兜底（2026-06-21 立项；2026-07-15 重构：去等阶 tier + 收敛 video-only）。
 *
 * 运行时以 DB (PetSpecies collection) 为准；本文件仅作 DB 为空时的 fallback。
 *
 * 字段语义：
 *   - key:    全局唯一 key（不暴露给玩家）
 *   - name:   中文名（玩家可见）
 *   - weight: 破壳抽中权重（全池按 weight 加权随机，无 tier 分池）
 *   - visualType: 恒为 'video'（宠物本体只用视频；DB 记录带 videoFile）
 */
const PET_SPECIES = Object.freeze([
  Object.freeze({ key: 'cat_orange',      name: '橘猫',     weight: 100 }),
  Object.freeze({ key: 'dog_puppy',       name: '小奶狗',   weight: 100 }),
  Object.freeze({ key: 'rabbit_white',    name: '小白兔',   weight: 100 }),
  Object.freeze({ key: 'hamster_gold',    name: '金丝熊',   weight: 100 }),
  Object.freeze({ key: 'fox_red',         name: '小狐狸',   weight: 100 }),
  Object.freeze({ key: 'panda_baby',      name: '熊猫宝宝', weight: 100 }),
  Object.freeze({ key: 'penguin_baby',    name: '小企鹅',   weight: 100 }),
  Object.freeze({ key: 'owl_horned',      name: '角鸮',     weight: 100 }),
  Object.freeze({ key: 'dragon_emperor',  name: '应龙',     weight: 100 }),
  Object.freeze({ key: 'phoenix_fire',    name: '朱雀',     weight: 100 }),
  Object.freeze({ key: 'unicorn_rainbow', name: '独角兽',   weight: 100 }),
  Object.freeze({ key: 'griffin_gold',    name: '金翅狮鹫', weight: 100 })
])

// 派生索引：key → 记录
const PET_SPECIES_BY_KEY = Object.freeze(
  PET_SPECIES.reduce((acc, s) => { acc[s.key] = s; return acc }, {})
)

/**
 * 按 key 查 species 记录；不存在返回 undefined。
 */
function getSpecies(key) {
  return PET_SPECIES_BY_KEY[key]
}

/**
 * 加权随机抽一个 species（破壳时用；全池，无 tier 分池）。
 *
 * @param {Array} [pool] - 候选 species 列表（缺省用兜底全池）
 * @returns {Object|null} 命中的 species 记录；池为空返回 null
 */
function rollSpecies(pool) {
  const list = Array.isArray(pool) && pool.length ? pool : PET_SPECIES
  if (!list.length) return null
  const total = list.reduce((sum, s) => sum + Math.max(0, s.weight || 0), 0)
  if (total <= 0) {
    return list[Math.floor(Math.random() * list.length)]
  }
  let r = Math.random() * total
  for (const s of list) {
    r -= Math.max(0, s.weight || 0)
    if (r <= 0) return s
  }
  return list[list.length - 1] // 浮点兜底
}

exports.PET_SPECIES = PET_SPECIES
exports.PET_SPECIES_BY_KEY = PET_SPECIES_BY_KEY
exports.getSpecies = getSpecies
exports.rollSpecies = rollSpecies
module.exports = exports
