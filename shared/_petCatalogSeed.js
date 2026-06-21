'use strict'

/**
 * 宠物图鉴种子数据（2026-06-21 pet-system-v2-ext）。
 *
 * 数据从原 v1 静态 shared/petSpecies.js + shared/petItems.js + shared/petConfig.js#FEED_REWARD 抽取
 * （v1 静态文件标记 deprecated，仅作为种子源 + DB 完全空时 fallback log）。
 *
 * 启动 seed 流程（startupMigrations.seedPetCatalog）：
 *   1. 给每个 isActive=true 的 org 写一份 per-org 种子（org=<orgId>），幂等
 *   2. 写一份平台默认（org=null），幂等
 *
 * 字段差异：
 *   - species: 加 visualType='image' (默认) / svgContent=null 占位；admin 上传图后替换 imageFile
 *   - item: 加 unlockType (level=升级解锁；halo/background=tier 升阶解锁)；compatibleSpecies=[] 默认
 *   - consumable: 把 v1 分散的 FEED_REWARD + feedCost 合并到 perTier.{tier}.{pointCost,hungerRestore,expGain}
 *
 * 与 PetAccount.species/unlocked/equipped 的兼容：
 *   species/unlocked/equipped 仍存 key 字符串（PetAccount schema 不变）。
 *   历史 PetAccount.species='cat_orange' 仍能在新 DB 找到对应 PetSpecies(key='cat_orange', org=...) 记录。
 */

const PET_SPECIES_SEED = Object.freeze([
  // C 阶
  { key: 'cat_orange',    name: '橘猫',     tier: 'C', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '常见的小猫' },
  { key: 'dog_puppy',     name: '小奶狗',   tier: 'C', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '黏人的小狗' },
  { key: 'rabbit_white',  name: '小白兔',   tier: 'C', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '蹦蹦跳跳' },
  { key: 'hamster_gold',  name: '金丝熊',   tier: 'C', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '圆滚滚' },
  // B 阶
  { key: 'fox_red',       name: '小狐狸',   tier: 'B', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '聪明机敏' },
  { key: 'panda_baby',    name: '熊猫宝宝', tier: 'B', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '憨态可掬' },
  { key: 'penguin_baby',  name: '小企鹅',   tier: 'B', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '走路摇摆' },
  { key: 'owl_horned',    name: '角鸮',     tier: 'B', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '夜行守护者' },
  // A 阶
  { key: 'wolf_arctic',   name: '北极狼',   tier: 'A', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '银白皮毛' },
  { key: 'deer_white',    name: '白鹿',     tier: 'A', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '森林精灵' },
  { key: 'hawk_red',      name: '赤鸢',     tier: 'A', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '翱翔天际' },
  { key: 'dolphin_blue',  name: '蓝海豚',   tier: 'A', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '聪明友善' },
  // S 阶
  { key: 'dragon_emperor', name: '应龙',    tier: 'S', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '神话瑞兽' },
  { key: 'phoenix_fire',   name: '朱雀',    tier: 'S', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '浴火重生' },
  { key: 'unicorn_rainbow',name: '独角兽',  tier: 'S', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '七彩梦幻' },
  { key: 'griffin_gold',   name: '金翅狮鹫',tier: 'S', visualType: 'image', imageFile: null, svgContent: null, weight: 100, isActive: true, description: '空中霸主' }
])

const PET_ITEMS_SEED = Object.freeze([
  // ===== hat =====
  { key: 'hat_party',      name: '派对帽',     slot: 'hat', unlockType: 'level', unlockTier: 'C', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '庆祝时刻必备' },
  { key: 'hat_bow_red',    name: '蝴蝶结',     slot: 'hat', unlockType: 'level', unlockTier: 'C', unlockLevel: 5,  imageFile: null, compatibleSpecies: [], isActive: true, description: '可爱加分' },
  { key: 'hat_wizard',     name: '巫师帽',     slot: 'hat', unlockType: 'level', unlockTier: 'B', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '魔法系入门' },
  { key: 'hat_scarf_pink', name: '粉色头巾',   slot: 'hat', unlockType: 'level', unlockTier: 'B', unlockLevel: 8,  imageFile: null, compatibleSpecies: [], isActive: true, description: '清新可爱' },
  { key: 'hat_helmet',     name: '骑士盔',     slot: 'hat', unlockType: 'level', unlockTier: 'A', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '帅气护甲' },
  { key: 'hat_laurel',     name: '桂冠',       slot: 'hat', unlockType: 'level', unlockTier: 'A', unlockLevel: 10, imageFile: null, compatibleSpecies: [], isActive: true, description: '胜利者的象征' },
  { key: 'hat_crown',      name: '黄金王冠',   slot: 'hat', unlockType: 'level', unlockTier: 'S', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '王者加冕' },
  { key: 'hat_horns',      name: '龙角',       slot: 'hat', unlockType: 'level', unlockTier: 'S', unlockLevel: 15, imageFile: null, compatibleSpecies: [], isActive: true, description: '龙的传人' },

  // ===== scarf =====
  { key: 'scarf_red',      name: '红围巾',     slot: 'scarf', unlockType: 'level', unlockTier: 'C', unlockLevel: 3,  imageFile: null, compatibleSpecies: [], isActive: true, description: '温暖牌围巾' },
  { key: 'scarf_blue',     name: '蓝围巾',     slot: 'scarf', unlockType: 'level', unlockTier: 'C', unlockLevel: 8,  imageFile: null, compatibleSpecies: [], isActive: true, description: '清爽宜人' },
  { key: 'scarf_gold',     name: '金围巾',     slot: 'scarf', unlockType: 'level', unlockTier: 'B', unlockLevel: 5,  imageFile: null, compatibleSpecies: [], isActive: true, description: '低调奢华' },
  { key: 'scarf_rainbow',  name: '彩虹围巾',   slot: 'scarf', unlockType: 'level', unlockTier: 'A', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '七彩炫目' },
  { key: 'scarf_galaxy',   name: '星云围巾',   slot: 'scarf', unlockType: 'level', unlockTier: 'S', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '来自宇宙深处' },

  // ===== clothes =====
  { key: 'clothes_tshirt', name: '小 T 恤',    slot: 'clothes', unlockType: 'level', unlockTier: 'C', unlockLevel: 2,  imageFile: null, compatibleSpecies: [], isActive: true, description: '百搭日常' },
  { key: 'clothes_sweater',name: '小毛衣',     slot: 'clothes', unlockType: 'level', unlockTier: 'C', unlockLevel: 7,  imageFile: null, compatibleSpecies: [], isActive: true, description: '秋冬必备' },
  { key: 'clothes_suit',   name: '绅士西装',   slot: 'clothes', unlockType: 'level', unlockTier: 'B', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '优雅得体' },
  { key: 'clothes_armor',  name: '骑士铠甲',   slot: 'clothes', unlockType: 'level', unlockTier: 'A', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '硬核防御' },
  { key: 'clothes_robe',   name: '法师长袍',   slot: 'clothes', unlockType: 'level', unlockTier: 'S', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '神秘气质' },

  // ===== accessory =====
  { key: 'acc_glasses',    name: '圆框眼镜',   slot: 'accessory', unlockType: 'level', unlockTier: 'C', unlockLevel: 4,  imageFile: null, compatibleSpecies: [], isActive: true, description: '文质彬彬' },
  { key: 'acc_bell',       name: '小铃铛',     slot: 'accessory', unlockType: 'level', unlockTier: 'C', unlockLevel: 9,  imageFile: null, compatibleSpecies: [], isActive: true, description: '叮叮当当' },
  { key: 'acc_gem_red',    name: '红宝石',     slot: 'accessory', unlockType: 'level', unlockTier: 'B', unlockLevel: 3,  imageFile: null, compatibleSpecies: [], isActive: true, description: '镶在胸前' },
  { key: 'acc_gem_blue',   name: '蓝宝石',     slot: 'accessory', unlockType: 'level', unlockTier: 'A', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '深邃如海' },
  { key: 'acc_star',       name: '小星星',     slot: 'accessory', unlockType: 'level', unlockTier: 'S', unlockLevel: 1,  imageFile: null, compatibleSpecies: [], isActive: true, description: '闪闪发光' },

  // ===== halo（升阶解锁，不自动装备） =====
  { key: 'halo_basic',     name: '微光',       slot: 'halo', unlockType: 'tier', unlockTier: 'B', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '淡淡光晕' },
  { key: 'halo_sparkle',   name: '星光',       slot: 'halo', unlockType: 'tier', unlockTier: 'B', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '星星点点' },
  { key: 'halo_glow',      name: '柔光',       slot: 'halo', unlockType: 'tier', unlockTier: 'A', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '柔和明亮' },
  { key: 'halo_rainbow',   name: '彩虹光环',   slot: 'halo', unlockType: 'tier', unlockTier: 'A', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '七彩环绕' },
  { key: 'halo_divine',    name: '神圣光环',   slot: 'halo', unlockType: 'tier', unlockTier: 'S', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '如神降临' },
  { key: 'halo_solar',     name: '日冕',       slot: 'halo', unlockType: 'tier', unlockTier: 'S', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '太阳光辉' },

  // ===== background（升阶解锁，不自动装备） =====
  { key: 'bg_meadow',      name: '草原',       slot: 'background', unlockType: 'tier', unlockTier: 'B', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '风吹草低' },
  { key: 'bg_sakura',      name: '樱花林',     slot: 'background', unlockType: 'tier', unlockTier: 'B', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '粉色花海' },
  { key: 'bg_clouds',      name: '云端',       slot: 'background', unlockType: 'tier', unlockTier: 'A', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '触手可及' },
  { key: 'bg_ocean',       name: '深海',       slot: 'background', unlockType: 'tier', unlockTier: 'A', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '蓝色深渊' },
  { key: 'bg_galaxy',      name: '银河',       slot: 'background', unlockType: 'tier', unlockTier: 'S', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '宇宙尽览' },
  { key: 'bg_celestial',   name: '天宫',       slot: 'background', unlockType: 'tier', unlockTier: 'S', unlockLevel: 1, imageFile: null, compatibleSpecies: [], isActive: true, description: '仙气缭绕' }
])

/**
 * 食物 + 玩具种子
 *
 * 食物 3 档（normal/premium/super）applicableTier='all'，perTier 每阶独立数值
 * 食物数据来源：v1 shared/petConfig.js#FEED_REWARD + PET_TIER_CONFIG.feedCost
 *
 * 玩具 3 档（ball/music_box/book）applicableTier='all'，与食物同机制；成本略低，经验回报略低
 */
const PET_CONSUMABLES_SEED = Object.freeze([
  // ===== 食物 =====
  {
    key: 'food_normal', name: '普通粮', kind: 'food', applicableTier: 'all',
    imageFile: null, isActive: true, description: '基础食物，便宜实惠',
    perTier: {
      C: { pointCost: 5,   hungerRestore: 15, expGain: 10 },
      B: { pointCost: 15,  hungerRestore: 12, expGain: 20 },
      A: { pointCost: 40,  hungerRestore: 10, expGain: 40 },
      S: { pointCost: 100, hungerRestore: 8,  expGain: 80 }
    }
  },
  {
    key: 'food_premium', name: '高级粮', kind: 'food', applicableTier: 'all',
    imageFile: null, isActive: true, description: '营养均衡',
    perTier: {
      C: { pointCost: 15,  hungerRestore: 40, expGain: 30 },
      B: { pointCost: 40,  hungerRestore: 35, expGain: 60 },
      A: { pointCost: 100, hungerRestore: 30, expGain: 120 },
      S: { pointCost: 250, hungerRestore: 25, expGain: 240 }
    }
  },
  {
    key: 'food_super', name: '特级粮', kind: 'food', applicableTier: 'all',
    imageFile: null, isActive: true, description: '豪华大餐',
    perTier: {
      C: { pointCost: 40,  hungerRestore: 100, expGain: 80 },
      B: { pointCost: 100, hungerRestore: 100, expGain: 160 },
      A: { pointCost: 250, hungerRestore: 100, expGain: 320 },
      S: { pointCost: 600, hungerRestore: 100, expGain: 640 }
    }
  },

  // ===== 玩具（同机制） =====
  {
    key: 'toy_ball', name: '小球', kind: 'toy', applicableTier: 'all',
    imageFile: null, isActive: true, description: '经典玩具',
    perTier: {
      C: { pointCost: 3,   hungerRestore: 5,  expGain: 5 },
      B: { pointCost: 8,   hungerRestore: 5,  expGain: 10 },
      A: { pointCost: 20,  hungerRestore: 5,  expGain: 20 },
      S: { pointCost: 50,  hungerRestore: 5,  expGain: 40 }
    }
  },
  {
    key: 'toy_music_box', name: '音乐盒', kind: 'toy', applicableTier: 'all',
    imageFile: null, isActive: true, description: '动听旋律',
    perTier: {
      C: { pointCost: 8,   hungerRestore: 10, expGain: 8 },
      B: { pointCost: 20,  hungerRestore: 10, expGain: 15 },
      A: { pointCost: 50,  hungerRestore: 10, expGain: 30 },
      S: { pointCost: 120, hungerRestore: 10, expGain: 60 }
    }
  },
  {
    key: 'toy_book', name: '故事书', kind: 'toy', applicableTier: 'all',
    imageFile: null, isActive: true, description: '增长见闻',
    perTier: {
      C: { pointCost: 10,  hungerRestore: 5,  expGain: 15 },
      B: { pointCost: 25,  hungerRestore: 5,  expGain: 30 },
      A: { pointCost: 60,  hungerRestore: 5,  expGain: 60 },
      S: { pointCost: 150, hungerRestore: 5,  expGain: 120 }
    }
  }
])

exports.PET_SPECIES_SEED = PET_SPECIES_SEED
exports.PET_ITEMS_SEED = PET_ITEMS_SEED
exports.PET_CONSUMABLES_SEED = PET_CONSUMABLES_SEED
module.exports = exports