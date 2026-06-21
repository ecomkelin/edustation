'use strict'

/**
 * 宠物种类图鉴（2026-06-21 立项，pet-system-v2）。
 *
 * 平台级共享，机构间一致。新种类走 PR 加：图片 + 名称 + 阶。
 *
 * 字段语义：
 *   - key:    全局唯一 key（与文件路径/前端组件名对应；不暴露给玩家）
 *   - name:   中文名（玩家可见）
 *   - tier:   C / B / A / S（决定破壳时该种是否可作为结果）
 *   - image:  静态资源路径（前端按 key 拼出 url，或上传到 File 后取 url）
 *   - weight: 破壳抽中权重（同一阶内所有 species 按 weight 加权随机）
 *
 * 4 阶 × 4 种 = 16 个起步。
 *
 * 未来加种类流程：
 *   1. 美术出图 → packages/client/src/static/pet/{key}.png
 *   2. 加一条记录到本文件（key 唯一；tier 合法；weight >= 0）
 *   3. PR 评审 → merge → 客户端按新图鉴渲染（无需 schema 变更）
 */
const PET_SPECIES = Object.freeze([
  // ===== C 阶：常见小动物 =====
  Object.freeze({ key: 'cat_orange',    name: '橘猫',     tier: 'C', image: 'pet/cat_orange.png',    weight: 100 }),
  Object.freeze({ key: 'dog_puppy',     name: '小奶狗',   tier: 'C', image: 'pet/dog_puppy.png',     weight: 100 }),
  Object.freeze({ key: 'rabbit_white',  name: '小白兔',   tier: 'C', image: 'pet/rabbit_white.png',  weight: 100 }),
  Object.freeze({ key: 'hamster_gold', name: '金丝熊',   tier: 'C', image: 'pet/hamster_gold.png', weight: 100 }),

  // ===== B 阶：稍珍稀的动物 =====
  Object.freeze({ key: 'fox_red',      name: '小狐狸',   tier: 'B', image: 'pet/fox_red.png',      weight: 100 }),
  Object.freeze({ key: 'panda_baby',   name: '熊猫宝宝', tier: 'B', image: 'pet/panda_baby.png',   weight: 100 }),
  Object.freeze({ key: 'penguin_baby', name: '小企鹅',   tier: 'B', image: 'pet/penguin_baby.png', weight: 100 }),
  Object.freeze({ key: 'owl_horned',   name: '角鸮',     tier: 'B', image: 'pet/owl_horned.png',   weight: 100 }),

  // ===== A 阶：珍稀野生动物 =====
  Object.freeze({ key: 'wolf_arctic',  name: '北极狼',   tier: 'A', image: 'pet/wolf_arctic.png',  weight: 100 }),
  Object.freeze({ key: 'deer_white',   name: '白鹿',     tier: 'A', image: 'pet/deer_white.png',   weight: 100 }),
  Object.freeze({ key: 'hawk_red',     name: '赤鸢',     tier: 'A', image: 'pet/hawk_red.png',     weight: 100 }),
  Object.freeze({ key: 'dolphin_blue', name: '蓝海豚',   tier: 'A', image: 'pet/dolphin_blue.png', weight: 100 }),

  // ===== S 阶：神话级 =====
  Object.freeze({ key: 'dragon_emperor', name: '应龙',   tier: 'S', image: 'pet/dragon_emperor.png', weight: 100 }),
  Object.freeze({ key: 'phoenix_fire',   name: '朱雀',   tier: 'S', image: 'pet/phoenix_fire.png',   weight: 100 }),
  Object.freeze({ key: 'unicorn_rainbow',name: '独角兽', tier: 'S', image: 'pet/unicorn_rainbow.png',weight: 100 }),
  Object.freeze({ key: 'griffin_gold',   name: '金翅狮鹫', tier: 'S', image: 'pet/griffin_gold.png', weight: 100 })
])

// 派生索引：key → 记录
const PET_SPECIES_BY_KEY = Object.freeze(
  PET_SPECIES.reduce((acc, s) => { acc[s.key] = s; return acc }, {})
)

// 派生索引：tier → 同阶 species 列表（破壳时用）
const PET_SPECIES_BY_TIER = Object.freeze(
  PET_SPECIES.reduce((acc, s) => {
    if (!acc[s.tier]) acc[s.tier] = []
    acc[s.tier].push(s)
    return acc
  }, {})
)

/**
 * 按 key 查 species 记录；不存在返回 undefined。
 */
function getSpecies(key) {
  return PET_SPECIES_BY_KEY[key]
}

/**
 * 按阶查所有 species。
 */
function listSpeciesByTier(tier) {
  return PET_SPECIES_BY_TIER[tier] || []
}

/**
 * 加权随机抽一个 species（破壳时用）。
 *
 * @param {String} tier - C / B / A / S
 * @returns {Object|null} 命中的 species 记录；池为空返回 null
 */
function rollSpecies(tier) {
  const pool = PET_SPECIES_BY_TIER[tier]
  if (!pool || pool.length === 0) return null
  const total = pool.reduce((sum, s) => sum + Math.max(0, s.weight || 0), 0)
  if (total <= 0) {
    // 全部 weight=0 时退化为均匀随机
    return pool[Math.floor(Math.random() * pool.length)]
  }
  let r = Math.random() * total
  for (const s of pool) {
    r -= Math.max(0, s.weight || 0)
    if (r <= 0) return s
  }
  return pool[pool.length - 1] // 浮点兜底
}

exports.PET_SPECIES = PET_SPECIES
exports.PET_SPECIES_BY_KEY = PET_SPECIES_BY_KEY
exports.PET_SPECIES_BY_TIER = PET_SPECIES_BY_TIER
exports.getSpecies = getSpecies
exports.listSpeciesByTier = listSpeciesByTier
exports.rollSpecies = rollSpecies
module.exports = exports
