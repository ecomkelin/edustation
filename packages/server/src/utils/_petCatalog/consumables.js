'use strict'

/**
 * PetConsumable 种子数据（2026-06-22 user SVG 决策）。
 *
 * 食物 + 玩具 = 6 条；每阶各一档食物 + 一档玩具。
 *
 * 设计：覆盖 v1 normal/premium/super 三档喂食曲线（参考 shared/petConfig.FEED_REWARD）
 *   - food_normal   applicableTier=all, 各阶基础值
 *   - food_premium  applicableTier=all, 各阶中等
 *   - food_super    applicableTier=all, 各阶高档
 *   - toy_ball      applicableTier=all, 玩具一档（基础）
 *   - toy_feather   applicableTier=all, 玩具二档
 *   - toy_musicbox  applicableTier=all, 玩具三档
 *
 * 注：v1 三档 normal/premium/super 的 FEED_REWARD 由食物三档承载；玩具额外。
 * 数值与 shared/petConfig.js v1 一致；toys expGain 略低（玩具不"喂养"）。
 */
const CONSUMABLES = [
  /* ─── food：食物三档（normal / premium / super）─── */
  {
    key: 'food_normal',
    name: '普通食物',
    kind: 'food',
    applicableTier: 'all',
    perTier: {
      all: { pointCost: 5, hungerRestore: 15, expGain: 10 }
    },
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 碗 -->
      <path d="M 8 38 L 12 52 Q 14 56 30 56 Q 46 56 48 52 L 52 38 Z" fill="#90CAF9" stroke="#1976D2" stroke-width="1"/>
      <ellipse cx="30" cy="38" rx="22" ry="4" fill="#42A5F5"/>
      <!-- 食物团 -->
      <ellipse cx="24" cy="34" rx="6" ry="3" fill="#FFE082"/>
      <ellipse cx="36" cy="34" rx="6" ry="3" fill="#FFE082"/>
      <ellipse cx="30" cy="32" rx="5" ry="2.5" fill="#FFC107"/>
      <!-- 高光 -->
      <ellipse cx="22" cy="33" rx="2" ry="1" fill="#FFF59D"/>
      <!-- 蒸汽 -->
      <path d="M 22 22 Q 20 18 22 14" stroke="#B3E5FC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M 30 20 Q 28 16 30 12" stroke="#B3E5FC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M 38 22 Q 36 18 38 14" stroke="#B3E5FC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    isActive: true,
    description: '日常饭团，便宜管饱'
  },
  {
    key: 'food_premium',
    name: '高级食物',
    kind: 'food',
    applicableTier: 'all',
    perTier: {
      all: { pointCost: 15, hungerRestore: 40, expGain: 30 }
    },
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 圆瓷盘 -->
      <ellipse cx="30" cy="42" rx="24" ry="6" fill="#FFE082" stroke="#FFA000" stroke-width="1"/>
      <ellipse cx="30" cy="40" rx="22" ry="5" fill="#FFF8E1"/>
      <!-- 主食 -->
      <ellipse cx="30" cy="36" rx="10" ry="4" fill="#FFB74D"/>
      <!-- 配菜 -->
      <circle cx="22" cy="34" r="3" fill="#E53935"/>
      <circle cx="38" cy="34" r="3" fill="#43A047"/>
      <circle cx="30" cy="32" r="2.5" fill="#FFEB3B"/>
      <!-- 装饰 -->
      <ellipse cx="22" cy="34" rx="1" ry="0.6" fill="#FFB6C1"/>
      <ellipse cx="38" cy="34" rx="1" ry="0.6" fill="#C8E6C9"/>
      <!-- 香草 -->
      <circle cx="18" cy="36" r="0.6" fill="#558B2F"/>
      <circle cx="42" cy="36" r="0.6" fill="#558B2F"/>
      <!-- 蒸汽 -->
      <path d="M 22 22 Q 20 18 22 14" stroke="#B3E5FC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M 30 18 Q 28 14 30 10" stroke="#B3E5FC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M 38 22 Q 36 18 38 14" stroke="#B3E5FC" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    isActive: true,
    description: '精致套餐，香气扑鼻'
  },
  {
    key: 'food_super',
    name: '特级食物',
    kind: 'food',
    applicableTier: 'all',
    perTier: {
      all: { pointCost: 40, hungerRestore: 100, expGain: 80 }
    },
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="fs-gold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFEB3B"/>
          <stop offset="100%" stop-color="#FF6F00"/>
        </radialGradient>
      </defs>
      <!-- 金边瓷盘 -->
      <ellipse cx="30" cy="42" rx="26" ry="7" fill="#FFD54F" stroke="#E65100" stroke-width="1"/>
      <ellipse cx="30" cy="40" rx="24" ry="6" fill="#FFF8E1"/>
      <ellipse cx="30" cy="40" rx="20" ry="5" fill="#FFE082"/>
      <!-- 主菜（牛排） -->
      <path d="M 18 36 Q 22 30 30 30 Q 38 30 42 36 Q 38 40 30 40 Q 22 40 18 36 Z" fill="#8D4B2C"/>
      <!-- 烤痕 -->
      <line x1="22" y1="34" x2="38" y2="34" stroke="#5D2E1B" stroke-width="0.6"/>
      <line x1="22" y1="36" x2="38" y2="36" stroke="#5D2E1B" stroke-width="0.6"/>
      <!-- 装饰菜 -->
      <circle cx="46" cy="34" r="2" fill="#E53935"/>
      <circle cx="46" cy="34" r="0.8" fill="#FFEB3B"/>
      <ellipse cx="14" cy="36" rx="2" ry="1" fill="#43A047"/>
      <!-- 鱼子 -->
      <circle cx="26" cy="32" r="0.6" fill="#FFEB3B"/>
      <circle cx="34" cy="32" r="0.6" fill="#FFEB3B"/>
      <circle cx="30" cy="34" r="0.6" fill="#FFEB3B"/>
      <!-- 高光星 -->
      <path d="M 12 12 L 13 14 L 15 14 L 13 16 L 14 18 L 12 17 L 10 18 L 11 16 L 9 14 L 11 14 Z" fill="url(#fs-gold)"/>
      <path d="M 48 10 L 49 12 L 51 12 L 49 14 L 50 16 L 48 15 L 46 16 L 47 14 L 45 12 L 47 12 Z" fill="url(#fs-gold)"/>
    </svg>`,
    isActive: true,
    description: '顶级料理，满汉全席'
  },

  /* ─── toy：玩具三档 ─── */
  {
    key: 'toy_ball',
    name: '小毛球',
    kind: 'toy',
    applicableTier: 'all',
    perTier: {
      all: { pointCost: 3, hungerRestore: 0, expGain: 5 }
    },
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="tb-red" cx="40%" cy="35%" r="60%">
          <stop offset="0%" stop-color="#FF8A80"/>
          <stop offset="100%" stop-color="#C62828"/>
        </radialGradient>
      </defs>
      <!-- 球 -->
      <circle cx="30" cy="34" r="18" fill="url(#tb-red)"/>
      <!-- 高光 -->
      <ellipse cx="24" cy="26" rx="4" ry="2.5" fill="#fff" opacity="0.6"/>
      <!-- 缝线 -->
      <path d="M 30 16 L 30 52" stroke="#7F0000" stroke-width="0.5" stroke-dasharray="2 1"/>
      <path d="M 12 34 L 48 34" stroke="#7F0000" stroke-width="0.5" stroke-dasharray="2 1"/>
      <path d="M 18 22 L 42 46" stroke="#7F0000" stroke-width="0.5" stroke-dasharray="2 1"/>
      <path d="M 42 22 L 18 46" stroke="#7F0000" stroke-width="0.5" stroke-dasharray="2 1"/>
      <!-- 闪光 -->
      <path d="M 46 8 L 47 10 L 49 10 L 47 12 L 48 14 L 46 13 L 44 14 L 45 12 L 43 10 L 45 10 Z" fill="#FFEB3B"/>
      <circle cx="10" cy="14" r="1" fill="#FFEB3B"/>
    </svg>`,
    isActive: true,
    description: '小球一抛，宠物满场跑'
  },
  {
    key: 'toy_feather',
    name: '羽毛逗猫棒',
    kind: 'toy',
    applicableTier: 'all',
    perTier: {
      all: { pointCost: 8, hungerRestore: 0, expGain: 15 }
    },
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 棒 -->
      <line x1="10" y1="50" x2="34" y2="14" stroke="#8D6E63" stroke-width="2.5" stroke-linecap="round"/>
      <!-- 绳 -->
      <line x1="34" y1="14" x2="44" y2="8" stroke="#5D4037" stroke-width="1"/>
      <!-- 羽毛 -->
      <ellipse cx="48" cy="10" rx="8" ry="3" fill="#E91E63" transform="rotate(-30 48 10)"/>
      <ellipse cx="50" cy="14" rx="8" ry="3" fill="#FF80AB" transform="rotate(-15 50 14)"/>
      <ellipse cx="46" cy="6" rx="8" ry="3" fill="#F48FB1" transform="rotate(-45 46 6)"/>
      <!-- 羽轴 -->
      <line x1="40" y1="14" x2="52" y2="6" stroke="#FCE4EC" stroke-width="0.5"/>
      <!-- 高光 -->
      <ellipse cx="46" cy="8" rx="2" ry="0.8" fill="#fff" opacity="0.7"/>
      <!-- 闪光 -->
      <circle cx="14" cy="42" r="0.8" fill="#FFEB3B"/>
      <circle cx="20" cy="36" r="0.6" fill="#FFEB3B"/>
    </svg>`,
    isActive: true,
    description: '羽毛飘动，宠物扑个不停'
  },
  {
    key: 'toy_musicbox',
    name: '八音盒',
    kind: 'toy',
    applicableTier: 'all',
    perTier: {
      all: { pointCost: 20, hungerRestore: 0, expGain: 35 }
    },
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tm-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFEB3B"/>
          <stop offset="100%" stop-color="#FF8F00"/>
        </linearGradient>
      </defs>
      <!-- 盒底 -->
      <rect x="10" y="36" width="40" height="18" rx="2" fill="url(#tm-gold)" stroke="#E65100" stroke-width="0.8"/>
      <!-- 盒盖（半开） -->
      <path d="M 12 36 Q 12 22 30 18 Q 48 22 48 36" fill="#FFD54F" stroke="#E65100" stroke-width="0.8"/>
      <!-- 顶部把手 -->
      <rect x="26" y="14" width="8" height="4" rx="1" fill="#FF6F00"/>
      <line x1="30" y1="10" x2="30" y2="14" stroke="#E65100" stroke-width="1.5"/>
      <!-- 圆舞者（中间） -->
      <ellipse cx="30" cy="30" rx="4" ry="6" fill="#F8BBD0"/>
      <circle cx="30" cy="24" r="2.5" fill="#FFE0B2"/>
      <!-- 裙 -->
      <path d="M 24 32 L 30 38 L 36 32 Z" fill="#E91E63"/>
      <!-- 音符 -->
      <circle cx="14" cy="20" r="1.5" fill="#7B1FA2"/>
      <line x1="15.5" y1="20" x2="15.5" y2="14" stroke="#7B1FA2" stroke-width="1"/>
      <circle cx="46" cy="14" r="1.5" fill="#7B1FA2"/>
      <line x1="47.5" y1="14" x2="47.5" y2="8" stroke="#7B1FA2" stroke-width="1"/>
      <circle cx="50" cy="24" r="1.2" fill="#7B1FA2"/>
      <!-- 装饰花 -->
      <circle cx="18" cy="46" r="1.5" fill="#E91E63"/>
      <circle cx="42" cy="46" r="1.5" fill="#E91E63"/>
    </svg>`,
    isActive: true,
    description: '旋转舞者 + 悠扬旋律'
  }
]

module.exports = CONSUMABLES