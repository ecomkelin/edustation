'use strict'

/**
 * 宠物装饰图鉴（2026-06-21 立项，pet-system-v2）。
 *
 * 6 个 slot：hat / scarf / clothes / accessory / halo / background
 *   - hat/scarf/clothes/accessory：通过升级解锁（unlockLevel）
 *   - halo/background：通过升阶解锁（unlockTier，所有 Lv 都可用）
 *
 * 字段语义：
 *   - key:         全局唯一 key
 *   - name:        中文名
 *   - type:        slot 类型（必须 ∈ SLOT_TYPES）
 *   - unlockTier:  最低阶（解锁所需；halo/background 必填；其他 = 'C' 即可）
 *   - unlockLevel: 最低等级（仅 hat/scarf/clothes/accessory 用；halo/background 写 1）
 *   - image:       静态资源路径
 *   - description: 一句话描述（前端 tooltip）
 *
 * 解锁逻辑（D3 决策）：
 *   - 升 Lv 触发 → 检查当前 Lv ≥ unlockLevel → 加入 unlocked[type]
 *   - 升阶触发   → 加入 unlocked.halo / unlocked.background 当前阶所有 item
 *   - 降阶时（D3）：unlocked 不动；equipped 中超新阶 unlockTier 的自动卸下
 *
 * 未来做商城/限时：加 PetItemOwnership 表，本文件不变。
 */

// slot 类型枚举
const SLOT_TYPES = Object.freeze(['hat', 'scarf', 'clothes', 'accessory', 'halo', 'background'])
const SLOT_LABELS = Object.freeze({
  hat: '帽子',
  scarf: '围巾',
  clothes: '衣服',
  accessory: '饰品',
  halo: '光环',
  background: '背景'
})

const PET_ITEMS = Object.freeze([
  // ===== hat：帽子（每阶 2 件，按等级解锁） =====
  Object.freeze({ key: 'hat_party',      name: '派对帽',     type: 'hat',  unlockTier: 'C', unlockLevel: 1,  image: 'pet/items/hat_party.png',      description: '庆祝时刻必备' }),
  Object.freeze({ key: 'hat_bow_red',    name: '蝴蝶结',     type: 'hat',  unlockTier: 'C', unlockLevel: 5,  image: 'pet/items/hat_bow_red.png',    description: '可爱加分' }),
  Object.freeze({ key: 'hat_wizard',     name: '巫师帽',     type: 'hat',  unlockTier: 'B', unlockLevel: 1,  image: 'pet/items/hat_wizard.png',     description: '魔法系入门' }),
  Object.freeze({ key: 'hat_scarf_pink', name: '粉色头巾',   type: 'hat',  unlockTier: 'B', unlockLevel: 8,  image: 'pet/items/hat_scarf_pink.png', description: '清新可爱' }),
  Object.freeze({ key: 'hat_helmet',     name: '骑士盔',     type: 'hat',  unlockTier: 'A', unlockLevel: 1,  image: 'pet/items/hat_helmet.png',     description: '帅气护甲' }),
  Object.freeze({ key: 'hat_laurel',     name: '桂冠',       type: 'hat',  unlockTier: 'A', unlockLevel: 10, image: 'pet/items/hat_laurel.png',     description: '胜利者的象征' }),
  Object.freeze({ key: 'hat_crown',      name: '黄金王冠',   type: 'hat',  unlockTier: 'S', unlockLevel: 1,  image: 'pet/items/hat_crown.png',      description: '王者加冕' }),
  Object.freeze({ key: 'hat_horns',      name: '龙角',       type: 'hat',  unlockTier: 'S', unlockLevel: 15, image: 'pet/items/hat_horns.png',      description: '龙的传人' }),

  // ===== scarf：围巾 =====
  Object.freeze({ key: 'scarf_red',      name: '红围巾',     type: 'scarf', unlockTier: 'C', unlockLevel: 3,  image: 'pet/items/scarf_red.png',      description: '温暖牌围巾' }),
  Object.freeze({ key: 'scarf_blue',     name: '蓝围巾',     type: 'scarf', unlockTier: 'C', unlockLevel: 8,  image: 'pet/items/scarf_blue.png',     description: '清爽宜人' }),
  Object.freeze({ key: 'scarf_gold',     name: '金围巾',     type: 'scarf', unlockTier: 'B', unlockLevel: 5,  image: 'pet/items/scarf_gold.png',     description: '低调奢华' }),
  Object.freeze({ key: 'scarf_rainbow',  name: '彩虹围巾',   type: 'scarf', unlockTier: 'A', unlockLevel: 1,  image: 'pet/items/scarf_rainbow.png',  description: '七彩炫目' }),
  Object.freeze({ key: 'scarf_galaxy',   name: '星云围巾',   type: 'scarf', unlockTier: 'S', unlockLevel: 1,  image: 'pet/items/scarf_galaxy.png',   description: '来自宇宙深处' }),

  // ===== clothes：衣服 =====
  Object.freeze({ key: 'clothes_tshirt', name: '小 T 恤',    type: 'clothes', unlockTier: 'C', unlockLevel: 2,  image: 'pet/items/clothes_tshirt.png', description: '百搭日常' }),
  Object.freeze({ key: 'clothes_sweater',name: '小毛衣',     type: 'clothes', unlockTier: 'C', unlockLevel: 7,  image: 'pet/items/clothes_sweater.png',description: '秋冬必备' }),
  Object.freeze({ key: 'clothes_suit',   name: '绅士西装',   type: 'clothes', unlockTier: 'B', unlockLevel: 1,  image: 'pet/items/clothes_suit.png',   description: '优雅得体' }),
  Object.freeze({ key: 'clothes_armor',  name: '骑士铠甲',   type: 'clothes', unlockTier: 'A', unlockLevel: 1,  image: 'pet/items/clothes_armor.png',  description: '硬核防御' }),
  Object.freeze({ key: 'clothes_robe',   name: '法师长袍',   type: 'clothes', unlockTier: 'S', unlockLevel: 1,  image: 'pet/items/clothes_robe.png',   description: '神秘气质' }),

  // ===== accessory：饰品（眼镜/铃铛/宝石） =====
  Object.freeze({ key: 'acc_glasses',    name: '圆框眼镜',   type: 'accessory', unlockTier: 'C', unlockLevel: 4,  image: 'pet/items/acc_glasses.png',    description: '文质彬彬' }),
  Object.freeze({ key: 'acc_bell',       name: '小铃铛',     type: 'accessory', unlockTier: 'C', unlockLevel: 9,  image: 'pet/items/acc_bell.png',       description: '叮叮当当' }),
  Object.freeze({ key: 'acc_gem_red',    name: '红宝石',     type: 'accessory', unlockTier: 'B', unlockLevel: 3,  image: 'pet/items/acc_gem_red.png',    description: '镶在胸前' }),
  Object.freeze({ key: 'acc_gem_blue',   name: '蓝宝石',     type: 'accessory', unlockTier: 'A', unlockLevel: 1,  image: 'pet/items/acc_gem_blue.png',   description: '深邃如海' }),
  Object.freeze({ key: 'acc_star',       name: '小星星',     type: 'accessory', unlockTier: 'S', unlockLevel: 1,  image: 'pet/items/acc_star.png',       description: '闪闪发光' }),

  // ===== halo：光环（升阶解锁，不自动装备） =====
  // B 阶（升到 B 解锁）
  Object.freeze({ key: 'halo_basic',     name: '微光',       type: 'halo', unlockTier: 'B', unlockLevel: 1, image: 'pet/items/halo_basic.png',     description: '淡淡光晕' }),
  Object.freeze({ key: 'halo_sparkle',   name: '星光',       type: 'halo', unlockTier: 'B', unlockLevel: 1, image: 'pet/items/halo_sparkle.png',   description: '星星点点' }),
  // A 阶
  Object.freeze({ key: 'halo_glow',      name: '柔光',       type: 'halo', unlockTier: 'A', unlockLevel: 1, image: 'pet/items/halo_glow.png',      description: '柔和明亮' }),
  Object.freeze({ key: 'halo_rainbow',   name: '彩虹光环',   type: 'halo', unlockTier: 'A', unlockLevel: 1, image: 'pet/items/halo_rainbow.png',   description: '七彩环绕' }),
  // S 阶
  Object.freeze({ key: 'halo_divine',    name: '神圣光环',   type: 'halo', unlockTier: 'S', unlockLevel: 1, image: 'pet/items/halo_divine.png',    description: '如神降临' }),
  Object.freeze({ key: 'halo_solar',     name: '日冕',       type: 'halo', unlockTier: 'S', unlockLevel: 1, image: 'pet/items/halo_solar.png',     description: '太阳光辉' }),

  // ===== background：背景（升阶解锁，不自动装备） =====
  // B 阶
  Object.freeze({ key: 'bg_meadow',      name: '草原',       type: 'background', unlockTier: 'B', unlockLevel: 1, image: 'pet/items/bg_meadow.png',      description: '风吹草低' }),
  Object.freeze({ key: 'bg_sakura',      name: '樱花林',     type: 'background', unlockTier: 'B', unlockLevel: 1, image: 'pet/items/bg_sakura.png',      description: '粉色花海' }),
  // A 阶
  Object.freeze({ key: 'bg_clouds',      name: '云端',       type: 'background', unlockTier: 'A', unlockLevel: 1, image: 'pet/items/bg_clouds.png',      description: '触手可及' }),
  Object.freeze({ key: 'bg_ocean',       name: '深海',       type: 'background', unlockTier: 'A', unlockLevel: 1, image: 'pet/items/bg_ocean.png',       description: '蓝色深渊' }),
  // S 阶
  Object.freeze({ key: 'bg_galaxy',      name: '银河',       type: 'background', unlockTier: 'S', unlockLevel: 1, image: 'pet/items/bg_galaxy.png',      description: '宇宙尽览' }),
  Object.freeze({ key: 'bg_celestial',   name: '天宫',       type: 'background', unlockTier: 'S', unlockLevel: 1, image: 'pet/items/bg_celestial.png',   description: '仙气缭绕' })
])

const PET_ITEMS_BY_KEY = Object.freeze(
  PET_ITEMS.reduce((acc, it) => { acc[it.key] = it; return acc }, {})
)

// 按 slot 索引：type → items[]（用于 UI 渲染 + 升 Lv 自动解锁计算）
const PET_ITEMS_BY_SLOT = Object.freeze(
  PET_ITEMS.reduce((acc, it) => {
    if (!acc[it.type]) acc[it.type] = []
    acc[it.type].push(it)
    return acc
  }, {})
)

// 按 (tier, type) 索引：升阶时把该 (tier, halo/background) 全部解锁
const PET_ITEMS_BY_TIER_SLOT = Object.freeze(
  PET_ITEMS.reduce((acc, it) => {
    const k = `${it.unlockTier}__${it.type}`
    if (!acc[k]) acc[k] = []
    acc[k].push(it)
    return acc
  }, {})
)

/**
 * 按 key 查 item。
 */
function getItem(key) {
  return PET_ITEMS_BY_KEY[key]
}

/**
 * 列出某 slot 的所有 item。
 */
function listItemsBySlot(slot) {
  return PET_ITEMS_BY_SLOT[slot] || []
}

/**
 * 列出 (tier, slot) 的所有 item（升阶解锁计算用）。
 */
function listItemsByTierSlot(tier, slot) {
  return PET_ITEMS_BY_TIER_SLOT[`${tier}__${slot}`] || []
}

/**
 * 升 Lv 触发时调用：返回当前等级下应解锁的"升级解锁型" item keys。
 * （仅看 hat/scarf/clothes/accessory 4 类；halo/background 走升阶解锁）
 */
function itemsUnlockedAtLevel(tier, level) {
  const unlocked = []
  for (const slot of ['hat', 'scarf', 'clothes', 'accessory']) {
    for (const it of (PET_ITEMS_BY_SLOT[slot] || [])) {
      // 升 Lv 解锁：unlockTier 阶以下的 item（同一阶内也能用）都按 level 阈值判断
      const tierOrder = ['C', 'B', 'A', 'S']
      const itemTierIdx = tierOrder.indexOf(it.unlockTier)
      const currentTierIdx = tierOrder.indexOf(tier)
      if (itemTierIdx > currentTierIdx) continue // 高阶物品不通过低阶 Lv 解锁
      if (it.unlockLevel <= level) unlocked.push(it.key)
    }
  }
  return unlocked
}

/**
 * 升阶触发时调用：返回新阶下应解锁的 halo + background 物品 keys。
 */
function itemsUnlockedAtTier(newTier) {
  const unlocked = []
  for (const slot of ['halo', 'background']) {
    for (const it of listItemsByTierSlot(newTier, slot)) {
      unlocked.push(it.key)
    }
  }
  return unlocked
}

exports.SLOT_TYPES = SLOT_TYPES
exports.SLOT_LABELS = SLOT_LABELS
exports.PET_ITEMS = PET_ITEMS
exports.PET_ITEMS_BY_KEY = PET_ITEMS_BY_KEY
exports.PET_ITEMS_BY_SLOT = PET_ITEMS_BY_SLOT
exports.PET_ITEMS_BY_TIER_SLOT = PET_ITEMS_BY_TIER_SLOT
exports.getItem = getItem
exports.listItemsBySlot = listItemsBySlot
exports.listItemsByTierSlot = listItemsByTierSlot
exports.itemsUnlockedAtLevel = itemsUnlockedAtLevel
exports.itemsUnlockedAtTier = itemsUnlockedAtTier
module.exports = exports
