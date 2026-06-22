'use strict'

/**
 * PetItem 种子数据（2026-06-22 user SVG 决策）。
 *
 * 6 个 slot × 多阶 = 35 条；走 visualType='svg' + svgContent 内联。
 *
 * slot 分布（与 shared/petItems.js v1 完全对仗）：
 *   - hat         8 (C:2, B:2, A:2, S:2)
 *   - scarf       5 (C:2, B:1, A:1, S:1)
 *   - clothes     5 (C:2, B:1, A:1, S:1)
 *   - accessory   5 (C:2, B:1, A:1, S:1)
 *   - halo        6 (B:2, A:2, S:2)
 *   - background  6 (B:2, A:2, S:2)
 *
 * 解锁方式：
 *   - unlockType='level' + unlockLevel  → 升级解锁
 *   - unlockType='tier'  + unlockTier  → 升阶解锁（halo/background 专用）
 *
 * compatibleSpecies = []  (D2 决策：宽松提示，equip 不校验)
 * 所有图统一 viewBox 0 0 60 60（贴图尺寸，叠加到 100x100 的 pet 上）
 */
const ITEMS = [
  /* ─── hat：帽子 ─── */
  {
    key: 'hat_party',
    name: '派对帽',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hp-cone" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF8F8F"/>
          <stop offset="100%" stop-color="#E63946"/>
        </linearGradient>
      </defs>
      <!-- 锥体 -->
      <path d="M 30 6 L 18 42 L 42 42 Z" fill="url(#hp-cone)"/>
      <!-- 帽底 -->
      <ellipse cx="30" cy="42" rx="14" ry="3" fill="#C62828"/>
      <!-- 帽球 -->
      <circle cx="30" cy="6" r="4" fill="#FFE082" stroke="#FF8F00" stroke-width="0.5"/>
      <circle cx="29" cy="5" r="1" fill="#fff"/>
      <!-- 条纹 -->
      <path d="M 25 22 L 35 22" stroke="#FFE082" stroke-width="2"/>
      <path d="M 22 32 L 38 32" stroke="#FFE082" stroke-width="2"/>
      <!-- 星 -->
      <path d="M 30 18 L 31 21 L 34 21 L 32 23 L 33 26 L 30 24 L 27 26 L 28 23 L 26 21 L 29 21 Z" fill="#FFE082"/>
    </svg>`,
    isActive: true,
    description: '庆祝时刻必备'
  },
  {
    key: 'hat_bow_red',
    name: '蝴蝶结',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 5,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M 8 22 Q 4 30 8 38 L 22 30 Z" fill="#FF4D6D"/>
      <path d="M 52 22 Q 56 30 52 38 L 38 30 Z" fill="#FF4D6D"/>
      <path d="M 8 22 Q 4 14 14 18 L 22 30 Z" fill="#FF6B9D" opacity="0.7"/>
      <path d="M 52 22 Q 56 14 46 18 L 38 30 Z" fill="#FF6B9D" opacity="0.7"/>
      <circle cx="30" cy="30" r="6" fill="#E63946"/>
      <circle cx="30" cy="30" r="3" fill="#FFB6C1"/>
      <circle cx="29" cy="29" r="1" fill="#fff"/>
      <!-- 飘带 -->
      <path d="M 28 36 Q 24 44 18 48" stroke="#FF4D6D" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M 32 36 Q 36 44 42 48" stroke="#FF4D6D" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`,
    isActive: true,
    description: '可爱加分'
  },
  {
    key: 'hat_wizard',
    name: '巫师帽',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'B',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hw-cone" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#5C6BC0"/>
          <stop offset="100%" stop-color="#1A237E"/>
        </linearGradient>
      </defs>
      <!-- 锥体（弯） -->
      <path d="M 38 6 Q 32 22 16 44 L 40 44 Q 44 26 40 6 Z" fill="url(#hw-cone)"/>
      <!-- 帽檐 -->
      <ellipse cx="28" cy="44" rx="16" ry="3" fill="#0D1453"/>
      <!-- 星星 -->
      <path d="M 22 24 L 23 27 L 26 27 L 24 29 L 25 32 L 22 30 L 19 32 L 20 29 L 18 27 L 21 27 Z" fill="#FFEB3B"/>
      <circle cx="32" cy="18" r="1.5" fill="#FFEB3B"/>
      <circle cx="26" cy="34" r="1" fill="#FFEB3B"/>
      <!-- 月亮 -->
      <path d="M 34 28 Q 38 26 36 32" stroke="#FFEB3B" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    isActive: true,
    description: '魔法系入门'
  },
  {
    key: 'hat_scarf_pink',
    name: '粉色头巾',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'B',
    unlockLevel: 8,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 头巾主体 -->
      <path d="M 8 30 Q 10 22 18 22 L 42 22 Q 50 22 52 30 L 48 38 Q 30 42 12 38 Z" fill="#FFB6C1"/>
      <!-- 蝴蝶结 -->
      <path d="M 26 16 L 22 10 L 30 14 Z" fill="#FF6B9D"/>
      <path d="M 34 16 L 38 10 L 30 14 Z" fill="#FF6B9D"/>
      <circle cx="30" cy="14" r="2.5" fill="#E63946"/>
      <!-- 圆点花纹 -->
      <circle cx="18" cy="32" r="1.8" fill="#FF6B9D"/>
      <circle cx="42" cy="32" r="1.8" fill="#FF6B9D"/>
      <circle cx="30" cy="30" r="1.5" fill="#FF6B9D"/>
      <circle cx="24" cy="36" r="1.5" fill="#FF6B9D"/>
      <circle cx="36" cy="36" r="1.5" fill="#FF6B9D"/>
      <!-- 飘带 -->
      <path d="M 10 30 Q 6 38 4 46" stroke="#FFB6C1" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M 50 30 Q 54 38 56 46" stroke="#FFB6C1" stroke-width="3" fill="none" stroke-linecap="round"/>
    </svg>`,
    isActive: true,
    description: '清新可爱'
  },
  {
    key: 'hat_helmet',
    name: '骑士盔',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'A',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hh-helm" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#B0BEC5"/>
          <stop offset="100%" stop-color="#455A64"/>
        </linearGradient>
      </defs>
      <!-- 盔体 -->
      <path d="M 14 36 Q 14 12 30 10 Q 46 12 46 36 L 46 42 L 14 42 Z" fill="url(#hh-helm)"/>
      <!-- 面甲缝 -->
      <line x1="30" y1="20" x2="30" y2="36" stroke="#1A237E" stroke-width="1.5"/>
      <!-- 眼缝 -->
      <rect x="20" y="22" width="20" height="3" fill="#1A237E"/>
      <!-- 顶饰（红缨） -->
      <ellipse cx="30" cy="10" rx="3" ry="2" fill="#FFD54F"/>
      <path d="M 30 8 L 26 2 L 30 4 L 34 2 Z" fill="#E63946"/>
      <!-- 边沿 -->
      <ellipse cx="30" cy="42" rx="16" ry="2" fill="#1A237E"/>
      <!-- 高光 -->
      <path d="M 18 22 Q 18 16 24 14" stroke="#ECEFF1" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    </svg>`,
    isActive: true,
    description: '帅气护甲'
  },
  {
    key: 'hat_laurel',
    name: '桂冠',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'A',
    unlockLevel: 10,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 主环 -->
      <path d="M 12 36 Q 30 48 48 36" stroke="#558B2F" stroke-width="3" fill="none"/>
      <path d="M 12 32 Q 30 44 48 32" stroke="#7CB342" stroke-width="3" fill="none"/>
      <!-- 叶 -->
      <ellipse cx="20" cy="30" rx="4" ry="2" fill="#7CB342" transform="rotate(-30 20 30)"/>
      <ellipse cx="26" cy="26" rx="4" ry="2" fill="#558B2F" transform="rotate(-20 26 26)"/>
      <ellipse cx="34" cy="26" rx="4" ry="2" fill="#558B2F" transform="rotate(20 34 26)"/>
      <ellipse cx="40" cy="30" rx="4" ry="2" fill="#7CB342" transform="rotate(30 40 30)"/>
      <ellipse cx="18" cy="36" rx="4" ry="2" fill="#7CB342" transform="rotate(-50 18 36)"/>
      <ellipse cx="42" cy="36" rx="4" ry="2" fill="#7CB342" transform="rotate(50 42 36)"/>
      <ellipse cx="30" cy="22" rx="4" ry="2" fill="#7CB342"/>
      <!-- 叶脉 -->
      <line x1="20" y1="30" x2="22" y2="29" stroke="#33691E" stroke-width="0.5"/>
      <line x1="26" y1="26" x2="28" y2="25" stroke="#33691E" stroke-width="0.5"/>
      <line x1="34" y1="26" x2="32" y2="25" stroke="#33691E" stroke-width="0.5"/>
      <line x1="40" y1="30" x2="38" y2="29" stroke="#33691E" stroke-width="0.5"/>
    </svg>`,
    isActive: true,
    description: '胜利者的象征'
  },
  {
    key: 'hat_crown',
    name: '黄金王冠',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'S',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hc-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFEB3B"/>
          <stop offset="100%" stop-color="#FF8F00"/>
        </linearGradient>
      </defs>
      <!-- 王冠底 -->
      <path d="M 10 42 L 14 18 L 22 30 L 30 12 L 38 30 L 46 18 L 50 42 Z" fill="url(#hc-gold)" stroke="#C62828" stroke-width="0.8"/>
      <!-- 红宝石 -->
      <circle cx="14" cy="38" r="2.5" fill="#E63946"/>
      <circle cx="22" cy="32" r="2.5" fill="#E63946"/>
      <circle cx="30" cy="20" r="3" fill="#E63946"/>
      <circle cx="38" cy="32" r="2.5" fill="#E63946"/>
      <circle cx="46" cy="38" r="2.5" fill="#E63946"/>
      <!-- 高光 -->
      <circle cx="13" cy="37" r="0.8" fill="#FFB6C1"/>
      <circle cx="29" cy="19" r="0.8" fill="#FFB6C1"/>
      <circle cx="45" cy="37" r="0.8" fill="#FFB6C1"/>
      <!-- 顶饰（十字） -->
      <path d="M 30 8 L 28 4 L 32 4 Z" fill="url(#hc-gold)"/>
      <!-- 阴影 -->
      <path d="M 10 42 L 50 42 L 48 46 L 12 46 Z" fill="#C62828" opacity="0.6"/>
    </svg>`,
    isActive: true,
    description: '王者加冕'
  },
  {
    key: 'hat_horns',
    name: '龙角',
    slot: 'hat',
    unlockType: 'level',
    unlockTier: 'S',
    unlockLevel: 15,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hh-horn" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFB74D"/>
          <stop offset="100%" stop-color="#D32F2F"/>
        </linearGradient>
      </defs>
      <!-- 左角 -->
      <path d="M 14 32 Q 8 18 16 8 Q 22 18 22 32 Z" fill="url(#hh-horn)" stroke="#B71C1C" stroke-width="0.8"/>
      <path d="M 16 28 L 14 22" stroke="#FFE0B2" stroke-width="0.8"/>
      <path d="M 18 24 L 16 18" stroke="#FFE0B2" stroke-width="0.8"/>
      <!-- 右角 -->
      <path d="M 46 32 Q 52 18 44 8 Q 38 18 38 32 Z" fill="url(#hh-horn)" stroke="#B71C1C" stroke-width="0.8"/>
      <path d="M 44 28 L 46 22" stroke="#FFE0B2" stroke-width="0.8"/>
      <path d="M 42 24 L 44 18" stroke="#FFE0B2" stroke-width="0.8"/>
      <!-- 根部 -->
      <ellipse cx="18" cy="32" rx="4" ry="2" fill="#5D4037"/>
      <ellipse cx="42" cy="32" rx="4" ry="2" fill="#5D4037"/>
    </svg>`,
    isActive: true,
    description: '龙的传人'
  },

  /* ─── scarf：围巾 ─── */
  {
    key: 'scarf_red',
    name: '红围巾',
    slot: 'scarf',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 3,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 围巾绕颈 -->
      <path d="M 8 28 Q 8 22 14 22 L 46 22 Q 52 22 52 28 Q 52 34 46 34 L 14 34 Q 8 34 8 28 Z" fill="#E63946"/>
      <!-- 垂带 -->
      <path d="M 16 34 L 14 56 L 20 56 L 22 34 Z" fill="#E63946"/>
      <path d="M 38 34 L 40 56 L 46 56 L 44 34 Z" fill="#E63946"/>
      <!-- 条纹 -->
      <path d="M 8 26 L 52 26" stroke="#FFE082" stroke-width="1"/>
      <path d="M 8 30 L 52 30" stroke="#FFE082" stroke-width="1"/>
      <!-- 流苏 -->
      <line x1="15" y1="56" x2="15" y2="58" stroke="#FFE082" stroke-width="0.5"/>
      <line x1="17" y1="56" x2="17" y2="58" stroke="#FFE082" stroke-width="0.5"/>
      <line x1="19" y1="56" x2="19" y2="58" stroke="#FFE082" stroke-width="0.5"/>
      <line x1="41" y1="56" x2="41" y2="58" stroke="#FFE082" stroke-width="0.5"/>
      <line x1="43" y1="56" x2="43" y2="58" stroke="#FFE082" stroke-width="0.5"/>
      <line x1="45" y1="56" x2="45" y2="58" stroke="#FFE082" stroke-width="0.5"/>
    </svg>`,
    isActive: true,
    description: '温暖牌围巾'
  },
  {
    key: 'scarf_blue',
    name: '蓝围巾',
    slot: 'scarf',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 8,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M 8 28 Q 8 22 14 22 L 46 22 Q 52 22 52 28 Q 52 34 46 34 L 14 34 Q 8 34 8 28 Z" fill="#1976D2"/>
      <path d="M 16 34 L 14 56 L 20 56 L 22 34 Z" fill="#1976D2"/>
      <path d="M 38 34 L 40 56 L 46 56 L 44 34 Z" fill="#1976D2"/>
      <!-- 雪花 -->
      <circle cx="20" cy="28" r="1.5" fill="#E1F5FE"/>
      <circle cx="30" cy="28" r="1.5" fill="#E1F5FE"/>
      <circle cx="40" cy="28" r="1.5" fill="#E1F5FE"/>
      <circle cx="17" cy="44" r="1.5" fill="#E1F5FE"/>
      <circle cx="43" cy="44" r="1.5" fill="#E1F5FE"/>
      <path d="M 30 28 L 30 31 M 28.5 29.5 L 31.5 29.5" stroke="#E1F5FE" stroke-width="0.6"/>
      <path d="M 20 28 L 20 31 M 18.5 29.5 L 21.5 29.5" stroke="#E1F5FE" stroke-width="0.6"/>
      <path d="M 40 28 L 40 31 M 38.5 29.5 L 41.5 29.5" stroke="#E1F5FE" stroke-width="0.6"/>
    </svg>`,
    isActive: true,
    description: '清爽宜人'
  },
  {
    key: 'scarf_gold',
    name: '金围巾',
    slot: 'scarf',
    unlockType: 'level',
    unlockTier: 'B',
    unlockLevel: 5,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sg-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFD54F"/>
          <stop offset="100%" stop-color="#FF8F00"/>
        </linearGradient>
      </defs>
      <path d="M 8 28 Q 8 22 14 22 L 46 22 Q 52 22 52 28 Q 52 34 46 34 L 14 34 Q 8 34 8 28 Z" fill="url(#sg-gold)"/>
      <path d="M 16 34 L 14 56 L 20 56 L 22 34 Z" fill="url(#sg-gold)"/>
      <path d="M 38 34 L 40 56 L 46 56 L 44 34 Z" fill="url(#sg-gold)"/>
      <!-- 暗纹 -->
      <path d="M 14 26 Q 30 30 46 26" stroke="#FFE082" stroke-width="0.8" fill="none"/>
      <path d="M 14 30 Q 30 34 46 30" stroke="#FFE082" stroke-width="0.8" fill="none"/>
      <!-- 宝石 -->
      <circle cx="30" cy="28" r="2.5" fill="#E63946"/>
      <circle cx="29" cy="27" r="0.8" fill="#FFB6C1"/>
    </svg>`,
    isActive: true,
    description: '低调奢华'
  },
  {
    key: 'scarf_rainbow',
    name: '彩虹围巾',
    slot: 'scarf',
    unlockType: 'level',
    unlockTier: 'A',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 彩虹色带 -->
      <path d="M 8 22 L 52 22 L 52 26 L 8 26 Z" fill="#E53935"/>
      <path d="M 8 26 L 52 26 L 52 30 L 8 30 Z" fill="#FB8C00"/>
      <path d="M 8 30 L 52 30 L 52 34 L 8 34 Z" fill="#FDD835"/>
      <path d="M 8 22 L 14 22 L 16 56 L 12 56 Z" fill="#E53935"/>
      <path d="M 14 22 L 16 22 L 18 56 L 14 56 Z" fill="#FB8C00"/>
      <path d="M 16 22 L 20 22 L 22 56 L 18 56 Z" fill="#FDD835"/>
      <path d="M 44 22 L 46 22 L 44 56 L 40 56 Z" fill="#43A047"/>
      <path d="M 46 22 L 48 22 L 48 56 L 44 56 Z" fill="#1E88E5"/>
      <path d="M 48 22 L 52 22 L 52 56 L 48 56 Z" fill="#8E24AA"/>
      <!-- 星 -->
      <circle cx="22" cy="28" r="1" fill="#fff"/>
      <circle cx="30" cy="28" r="1" fill="#fff"/>
      <circle cx="38" cy="28" r="1" fill="#fff"/>
      <circle cx="20" cy="44" r="1" fill="#fff"/>
      <circle cx="40" cy="44" r="1" fill="#fff"/>
    </svg>`,
    isActive: true,
    description: '七彩炫目'
  },
  {
    key: 'scarf_galaxy',
    name: '星云围巾',
    slot: 'scarf',
    unlockType: 'level',
    unlockTier: 'S',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sga-galaxy" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#311B92"/>
          <stop offset="50%" stop-color="#7B1FA2"/>
          <stop offset="100%" stop-color="#1A237E"/>
        </linearGradient>
      </defs>
      <path d="M 8 28 Q 8 22 14 22 L 46 22 Q 52 22 52 28 Q 52 34 46 34 L 14 34 Q 8 34 8 28 Z" fill="url(#sga-galaxy)"/>
      <path d="M 16 34 L 14 56 L 20 56 L 22 34 Z" fill="url(#sga-galaxy)"/>
      <path d="M 38 34 L 40 56 L 46 56 L 44 34 Z" fill="url(#sga-galaxy)"/>
      <!-- 星 -->
      <circle cx="16" cy="26" r="1" fill="#FFEB3B"/>
      <circle cx="24" cy="30" r="0.8" fill="#fff"/>
      <circle cx="32" cy="26" r="1.2" fill="#FFEB3B"/>
      <circle cx="40" cy="30" r="0.8" fill="#fff"/>
      <circle cx="46" cy="26" r="1" fill="#FFEB3B"/>
      <circle cx="18" cy="44" r="0.8" fill="#fff"/>
      <circle cx="42" cy="44" r="0.8" fill="#fff"/>
      <!-- 螺旋 -->
      <path d="M 16 44 Q 22 40 28 44" stroke="#FF6B9D" stroke-width="0.8" fill="none" opacity="0.7"/>
      <path d="M 32 44 Q 38 40 44 44" stroke="#FF6B9D" stroke-width="0.8" fill="none" opacity="0.7"/>
    </svg>`,
    isActive: true,
    description: '来自宇宙深处'
  },

  /* ─── clothes：衣服 ─── */
  {
    key: 'clothes_tshirt',
    name: '小 T 恤',
    slot: 'clothes',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 2,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- T 恤身 -->
      <path d="M 14 22 L 22 16 L 38 16 L 46 22 L 50 30 L 44 32 L 44 50 L 16 50 L 16 32 L 10 30 Z" fill="#42A5F5"/>
      <!-- 领口 -->
      <path d="M 26 16 Q 30 22 34 16" fill="#E3F2FD"/>
      <!-- 袖 -->
      <path d="M 14 22 L 10 30 L 16 32" fill="#1976D2"/>
      <path d="M 46 22 L 50 30 L 44 32" fill="#1976D2"/>
      <!-- 印花 -->
      <circle cx="30" cy="34" r="3" fill="#FFEB3B"/>
      <path d="M 30 32 L 30 36 M 28 34 L 32 34" stroke="#FF8F00" stroke-width="0.8"/>
      <circle cx="22" cy="42" r="1.5" fill="#FF6B9D"/>
      <circle cx="38" cy="42" r="1.5" fill="#FF6B9D"/>
    </svg>`,
    isActive: true,
    description: '百搭日常'
  },
  {
    key: 'clothes_sweater',
    name: '小毛衣',
    slot: 'clothes',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 7,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <path d="M 14 22 L 22 16 L 38 16 L 46 22 L 50 30 L 44 32 L 44 50 L 16 50 L 16 32 L 10 30 Z" fill="#E91E63"/>
      <path d="M 26 16 Q 30 22 34 16" fill="#C2185B"/>
      <path d="M 14 22 L 10 30 L 16 32" fill="#C2185B"/>
      <path d="M 46 22 L 50 30 L 44 32" fill="#C2185B"/>
      <!-- 麻花纹 -->
      <path d="M 20 24 L 20 28 M 22 24 L 22 28 M 24 24 L 24 28" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 28 24 L 28 28 M 30 24 L 30 28 M 32 24 L 32 28" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 36 24 L 36 28 M 38 24 L 38 28 M 40 24 L 40 28" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 20 32 L 20 36 M 22 32 L 22 36 M 24 32 L 24 36" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 28 32 L 28 36 M 30 32 L 30 36 M 32 32 L 32 36" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 36 32 L 36 36 M 38 32 L 38 36 M 40 32 L 40 36" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 20 40 L 20 44 M 22 40 L 22 44 M 24 40 L 24 44" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 28 40 L 28 44 M 30 40 L 30 44 M 32 40 L 32 44" stroke="#F8BBD0" stroke-width="1"/>
      <path d="M 36 40 L 36 44 M 38 40 L 38 44 M 40 40 L 40 44" stroke="#F8BBD0" stroke-width="1"/>
      <!-- 雪花 -->
      <circle cx="30" cy="46" r="2" fill="#fff"/>
      <path d="M 30 44 L 30 48 M 28 46 L 32 46 M 28.5 44.5 L 31.5 47.5 M 31.5 44.5 L 28.5 47.5" stroke="#FFEB3B" stroke-width="0.5"/>
    </svg>`,
    isActive: true,
    description: '秋冬必备'
  },
  {
    key: 'clothes_suit',
    name: '绅士西装',
    slot: 'clothes',
    unlockType: 'level',
    unlockTier: 'B',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 西装主体 -->
      <path d="M 14 22 L 22 16 L 38 16 L 46 22 L 50 30 L 44 32 L 44 50 L 16 50 L 16 32 L 10 30 Z" fill="#212121"/>
      <!-- 白衬衫 -->
      <path d="M 26 16 L 30 30 L 34 16 Z" fill="#fff"/>
      <!-- 领带 -->
      <path d="M 28 22 L 32 22 L 33 44 L 30 50 L 27 44 Z" fill="#C62828"/>
      <!-- 翻领 -->
      <path d="M 22 16 L 26 22 L 22 30 Z" fill="#212121"/>
      <path d="M 38 16 L 34 22 L 38 30 Z" fill="#212121"/>
      <!-- 纽扣 -->
      <circle cx="22" cy="34" r="1" fill="#FFD54F"/>
      <circle cx="22" cy="40" r="1" fill="#FFD54F"/>
      <circle cx="38" cy="34" r="1" fill="#FFD54F"/>
      <circle cx="38" cy="40" r="1" fill="#FFD54F"/>
      <!-- 口袋巾 -->
      <path d="M 16 36 L 20 34 L 20 38 L 16 38 Z" fill="#fff"/>
    </svg>`,
    isActive: true,
    description: '优雅得体'
  },
  {
    key: 'clothes_armor',
    name: '骑士铠甲',
    slot: 'clothes',
    unlockType: 'level',
    unlockTier: 'A',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ca-metal" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#90A4AE"/>
          <stop offset="100%" stop-color="#37474F"/>
        </linearGradient>
      </defs>
      <path d="M 14 22 L 22 16 L 38 16 L 46 22 L 50 30 L 44 32 L 44 50 L 16 50 L 16 32 L 10 30 Z" fill="url(#ca-metal)"/>
      <!-- 胸甲片 -->
      <path d="M 22 22 L 30 26 L 38 22 L 36 36 L 30 38 L 24 36 Z" fill="#546E7A" stroke="#263238" stroke-width="0.5"/>
      <!-- 中线 -->
      <line x1="30" y1="26" x2="30" y2="38" stroke="#263238" stroke-width="0.8"/>
      <!-- 肩甲 -->
      <ellipse cx="14" cy="24" rx="6" ry="4" fill="#455A64"/>
      <ellipse cx="46" cy="24" rx="6" ry="4" fill="#455A64"/>
      <!-- 铆钉 -->
      <circle cx="14" cy="24" r="1" fill="#FFD54F"/>
      <circle cx="46" cy="24" r="1" fill="#FFD54F"/>
      <!-- 高光 -->
      <path d="M 18 20 L 24 18" stroke="#ECEFF1" stroke-width="0.8"/>
      <!-- 红披风（领口） -->
      <path d="M 24 16 L 26 22 L 30 18 L 34 22 L 36 16" fill="#C62828"/>
    </svg>`,
    isActive: true,
    description: '硬核防御'
  },
  {
    key: 'clothes_robe',
    name: '法师长袍',
    slot: 'clothes',
    unlockType: 'level',
    unlockTier: 'S',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cr-robe" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#7B1FA2"/>
          <stop offset="100%" stop-color="#311B92"/>
        </linearGradient>
      </defs>
      <!-- 长袍（下摆更宽） -->
      <path d="M 14 22 L 22 16 L 38 16 L 46 22 L 56 52 L 4 52 L 10 30 Z" fill="url(#cr-robe)"/>
      <!-- 翻领 -->
      <path d="M 22 16 L 26 30 L 30 22 L 34 30 L 38 16 Z" fill="#4A148C"/>
      <!-- 袖 -->
      <path d="M 14 22 L 4 52 L 10 52 L 16 32 Z" fill="#4A148C"/>
      <path d="M 46 22 L 56 52 L 50 52 L 44 32 Z" fill="#4A148C"/>
      <!-- 胸前符文 -->
      <circle cx="30" cy="38" r="3" fill="#FFEB3B"/>
      <circle cx="30" cy="38" r="1.5" fill="#E65100"/>
      <!-- 星 -->
      <circle cx="22" cy="42" r="0.8" fill="#FFEB3B"/>
      <circle cx="38" cy="42" r="0.8" fill="#FFEB3B"/>
      <circle cx="20" cy="48" r="0.8" fill="#FFEB3B"/>
      <circle cx="40" cy="48" r="0.8" fill="#FFEB3B"/>
    </svg>`,
    isActive: true,
    description: '神秘气质'
  },

  /* ─── accessory：饰品（眼镜/铃铛/宝石） ─── */
  {
    key: 'acc_glasses',
    name: '圆框眼镜',
    slot: 'accessory',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 4,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <!-- 左镜片 -->
      <circle cx="20" cy="32" r="10" fill="none" stroke="#5D4037" stroke-width="2.5"/>
      <circle cx="20" cy="32" r="8" fill="#E1F5FE" opacity="0.5"/>
      <!-- 右镜片 -->
      <circle cx="40" cy="32" r="10" fill="none" stroke="#5D4037" stroke-width="2.5"/>
      <circle cx="40" cy="32" r="8" fill="#E1F5FE" opacity="0.5"/>
      <!-- 鼻梁 -->
      <line x1="28" y1="32" x2="32" y2="32" stroke="#5D4037" stroke-width="2.5"/>
      <!-- 高光 -->
      <circle cx="17" cy="29" r="2" fill="#fff" opacity="0.7"/>
      <circle cx="37" cy="29" r="2" fill="#fff" opacity="0.7"/>
    </svg>`,
    isActive: true,
    description: '文质彬彬'
  },
  {
    key: 'acc_bell',
    name: '小铃铛',
    slot: 'accessory',
    unlockType: 'level',
    unlockTier: 'C',
    unlockLevel: 9,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ab-gold" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFEB3B"/>
          <stop offset="100%" stop-color="#FF8F00"/>
        </linearGradient>
      </defs>
      <!-- 缎带 -->
      <path d="M 22 10 L 26 22 L 34 22 L 38 10 Z" fill="#E91E63"/>
      <line x1="22" y1="10" x2="20" y2="6" stroke="#C2185B" stroke-width="2"/>
      <line x1="38" y1="10" x2="40" y2="6" stroke="#C2185B" stroke-width="2"/>
      <!-- 铃身 -->
      <path d="M 22 22 L 18 44 Q 18 50 30 50 Q 42 50 42 44 L 38 22 Z" fill="url(#ab-gold)" stroke="#C62828" stroke-width="0.8"/>
      <!-- 铃口 -->
      <ellipse cx="30" cy="44" rx="12" ry="3" fill="#E65100"/>
      <!-- 铃舌 -->
      <circle cx="30" cy="46" r="2.5" fill="#5D4037"/>
      <!-- 高光 -->
      <path d="M 22 26 L 22 40" stroke="#FFF59D" stroke-width="1.5"/>
      <!-- 纹路 -->
      <line x1="20" y1="30" x2="40" y2="30" stroke="#C62828" stroke-width="0.5"/>
      <line x1="19" y1="36" x2="41" y2="36" stroke="#C62828" stroke-width="0.5"/>
    </svg>`,
    isActive: true,
    description: '叮叮当当'
  },
  {
    key: 'acc_gem_red',
    name: '红宝石',
    slot: 'accessory',
    unlockType: 'level',
    unlockTier: 'B',
    unlockLevel: 3,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="ag-red" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FF8F8F"/>
          <stop offset="50%" stop-color="#E63946"/>
          <stop offset="100%" stop-color="#B71C1C"/>
        </linearGradient>
      </defs>
      <!-- 链 -->
      <line x1="30" y1="6" x2="30" y2="20" stroke="#FFD54F" stroke-width="2"/>
      <circle cx="30" cy="6" r="2" fill="#FFD54F"/>
      <!-- 宝石 -->
      <path d="M 30 22 L 22 30 L 30 50 L 38 30 Z" fill="url(#ag-red)" stroke="#B71C1C" stroke-width="0.8"/>
      <!-- 刻面 -->
      <line x1="22" y1="30" x2="38" y2="30" stroke="#B71C1C" stroke-width="0.8"/>
      <line x1="30" y1="22" x2="26" y2="30" stroke="#B71C1C" stroke-width="0.5"/>
      <line x1="30" y1="22" x2="34" y2="30" stroke="#B71C1C" stroke-width="0.5"/>
      <!-- 高光 -->
      <path d="M 26 26 L 28 28 L 26 32 Z" fill="#FFB6C1" opacity="0.7"/>
    </svg>`,
    isActive: true,
    description: '镶在胸前'
  },
  {
    key: 'acc_gem_blue',
    name: '蓝宝石',
    slot: 'accessory',
    unlockType: 'level',
    unlockTier: 'A',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="agb-blue" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#90CAF9"/>
          <stop offset="50%" stop-color="#1976D2"/>
          <stop offset="100%" stop-color="#0D47A1"/>
        </linearGradient>
      </defs>
      <line x1="30" y1="6" x2="30" y2="20" stroke="#FFD54F" stroke-width="2"/>
      <circle cx="30" cy="6" r="2" fill="#FFD54F"/>
      <path d="M 30 22 L 22 30 L 30 50 L 38 30 Z" fill="url(#agb-blue)" stroke="#0D47A1" stroke-width="0.8"/>
      <line x1="22" y1="30" x2="38" y2="30" stroke="#0D47A1" stroke-width="0.8"/>
      <line x1="30" y1="22" x2="26" y2="30" stroke="#0D47A1" stroke-width="0.5"/>
      <line x1="30" y1="22" x2="34" y2="30" stroke="#0D47A1" stroke-width="0.5"/>
      <path d="M 26 26 L 28 28 L 26 32 Z" fill="#E3F2FD" opacity="0.7"/>
    </svg>`,
    isActive: true,
    description: '深邃如海'
  },
  {
    key: 'acc_star',
    name: '小星星',
    slot: 'accessory',
    unlockType: 'level',
    unlockTier: 'S',
    unlockLevel: 1,
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="as-gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#FFEB3B"/>
          <stop offset="100%" stop-color="#FF8F00"/>
        </linearGradient>
      </defs>
      <line x1="30" y1="6" x2="30" y2="14" stroke="#FFD54F" stroke-width="2"/>
      <circle cx="30" cy="6" r="2" fill="#FFD54F"/>
      <!-- 五角星 -->
      <path d="M 30 14 L 33.5 26 L 46 26 L 35.5 33 L 39 45 L 30 38 L 21 45 L 24.5 33 L 14 26 L 26.5 26 Z" fill="url(#as-gold)" stroke="#E65100" stroke-width="0.8"/>
      <!-- 高光 -->
      <path d="M 28 18 L 32 26 L 28 26 Z" fill="#FFF59D" opacity="0.7"/>
    </svg>`,
    isActive: true,
    description: '闪闪发光'
  },

  /* ─── halo：光环 ─── */
  {
    key: 'halo_basic',
    name: '微光',
    slot: 'halo',
    unlockType: 'tier',
    unlockTier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="14" rx="16" ry="3" fill="none" stroke="#FFE082" stroke-width="2"/>
      <ellipse cx="30" cy="14" rx="12" ry="2" fill="#FFF9C4" opacity="0.6"/>
    </svg>`,
    isActive: true,
    description: '淡淡光晕'
  },
  {
    key: 'halo_sparkle',
    name: '星光',
    slot: 'halo',
    unlockType: 'tier',
    unlockTier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="14" rx="16" ry="3" fill="none" stroke="#FFD54F" stroke-width="2"/>
      <!-- 星 -->
      <path d="M 12 8 L 13 11 L 16 11 L 14 13 L 15 16 L 12 14 L 9 16 L 10 13 L 8 11 L 11 11 Z" fill="#FFEB3B"/>
      <path d="M 48 8 L 49 11 L 52 11 L 50 13 L 51 16 L 48 14 L 45 16 L 46 13 L 44 11 L 47 11 Z" fill="#FFEB3B"/>
      <circle cx="6" cy="14" r="1" fill="#FFEB3B"/>
      <circle cx="54" cy="14" r="1" fill="#FFEB3B"/>
      <circle cx="30" cy="6" r="1" fill="#FFEB3B"/>
    </svg>`,
    isActive: true,
    description: '星星点点'
  },
  {
    key: 'halo_glow',
    name: '柔光',
    slot: 'halo',
    unlockType: 'tier',
    unlockTier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="hg-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFEB3B" stop-opacity="0.8"/>
          <stop offset="100%" stop-color="#FFEB3B" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="30" cy="14" rx="18" ry="4" fill="#FFEB3B"/>
      <ellipse cx="30" cy="14" rx="14" ry="3" fill="#FFF9C4"/>
      <ellipse cx="30" cy="14" rx="22" ry="6" fill="url(#hg-glow)"/>
    </svg>`,
    isActive: true,
    description: '柔和明亮'
  },
  {
    key: 'halo_rainbow',
    name: '彩虹光环',
    slot: 'halo',
    unlockType: 'tier',
    unlockTier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="30" cy="14" rx="16" ry="3" fill="none" stroke="#E53935" stroke-width="1.5"/>
      <ellipse cx="30" cy="14" rx="18" ry="4" fill="none" stroke="#FB8C00" stroke-width="1.5"/>
      <ellipse cx="30" cy="14" rx="20" ry="5" fill="none" stroke="#FDD835" stroke-width="1.5"/>
      <ellipse cx="30" cy="14" rx="22" ry="6" fill="none" stroke="#43A047" stroke-width="1.5"/>
      <ellipse cx="30" cy="14" rx="24" ry="7" fill="none" stroke="#1E88E5" stroke-width="1.5"/>
      <ellipse cx="30" cy="14" rx="26" ry="8" fill="none" stroke="#8E24AA" stroke-width="1.5"/>
      <circle cx="30" cy="14" r="2" fill="#FFEB3B"/>
    </svg>`,
    isActive: true,
    description: '七彩环绕'
  },
  {
    key: 'halo_divine',
    name: '神圣光环',
    slot: 'halo',
    unlockType: 'tier',
    unlockTier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="hd-divine" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.9"/>
          <stop offset="100%" stop-color="#FFEB3B" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="30" cy="14" rx="20" ry="5" fill="url(#hd-divine)"/>
      <ellipse cx="30" cy="14" rx="16" ry="3" fill="none" stroke="#FFD54F" stroke-width="2"/>
      <ellipse cx="30" cy="14" rx="12" ry="2" fill="#FFF9C4"/>
      <!-- 光柱 -->
      <line x1="30" y1="20" x2="30" y2="56" stroke="#FFEB3B" stroke-width="1" opacity="0.4"/>
      <line x1="22" y1="22" x2="22" y2="54" stroke="#FFEB3B" stroke-width="1" opacity="0.3"/>
      <line x1="38" y1="22" x2="38" y2="54" stroke="#FFEB3B" stroke-width="1" opacity="0.3"/>
    </svg>`,
    isActive: true,
    description: '如神降临'
  },
  {
    key: 'halo_solar',
    name: '日冕',
    slot: 'halo',
    unlockType: 'tier',
    unlockTier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="hs-solar" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="#FFEB3B"/>
          <stop offset="100%" stop-color="#FF6F00"/>
        </radialGradient>
      </defs>
      <!-- 光芒 -->
      <g transform="translate(30 14)">
        <line x1="0" y1="-10" x2="0" y2="-18" stroke="#FF6F00" stroke-width="2"/>
        <line x1="0" y1="10" x2="0" y2="18" stroke="#FF6F00" stroke-width="2"/>
        <line x1="-10" y1="0" x2="-18" y2="0" stroke="#FF6F00" stroke-width="2"/>
        <line x1="10" y1="0" x2="18" y2="0" stroke="#FF6F00" stroke-width="2"/>
        <line x1="-7" y1="-7" x2="-13" y2="-13" stroke="#FF6F00" stroke-width="2"/>
        <line x1="7" y1="-7" x2="13" y2="-13" stroke="#FF6F00" stroke-width="2"/>
        <line x1="-7" y1="7" x2="-13" y2="13" stroke="#FF6F00" stroke-width="2"/>
        <line x1="7" y1="7" x2="13" y2="13" stroke="#FF6F00" stroke-width="2"/>
      </g>
      <!-- 中心 -->
      <circle cx="30" cy="14" r="6" fill="url(#hs-solar)"/>
      <circle cx="30" cy="14" r="3" fill="#FFEB3B"/>
    </svg>`,
    isActive: true,
    description: '太阳光辉'
  },

  /* ─── background：背景 ─── */
  {
    key: 'bg_meadow',
    name: '草原',
    slot: 'background',
    unlockType: 'tier',
    unlockTier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgm-sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#81D4FA"/>
          <stop offset="100%" stop-color="#B3E5FC"/>
        </linearGradient>
      </defs>
      <rect width="60" height="60" fill="url(#bgm-sky)"/>
      <!-- 太阳 -->
      <circle cx="46" cy="14" r="5" fill="#FFEB3B"/>
      <circle cx="46" cy="14" r="3" fill="#FFF59D"/>
      <!-- 云 -->
      <ellipse cx="14" cy="14" rx="6" ry="3" fill="#fff" opacity="0.9"/>
      <ellipse cx="18" cy="12" rx="5" ry="2.5" fill="#fff" opacity="0.9"/>
      <!-- 草地 -->
      <path d="M 0 36 Q 30 32 60 36 L 60 60 L 0 60 Z" fill="#7CB342"/>
      <path d="M 0 42 Q 30 38 60 42 L 60 60 L 0 60 Z" fill="#558B2F"/>
      <!-- 草叶 -->
      <line x1="6" y1="40" x2="6" y2="36" stroke="#33691E" stroke-width="0.8"/>
      <line x1="12" y1="42" x2="12" y2="38" stroke="#33691E" stroke-width="0.8"/>
      <line x1="20" y1="44" x2="20" y2="40" stroke="#33691E" stroke-width="0.8"/>
      <line x1="40" y1="42" x2="40" y2="38" stroke="#33691E" stroke-width="0.8"/>
      <line x1="48" y1="44" x2="48" y2="40" stroke="#33691E" stroke-width="0.8"/>
      <line x1="54" y1="40" x2="54" y2="36" stroke="#33691E" stroke-width="0.8"/>
      <!-- 花 -->
      <circle cx="14" cy="46" r="1.2" fill="#FF6B9D"/>
      <circle cx="46" cy="48" r="1.2" fill="#FFEB3B"/>
      <circle cx="30" cy="50" r="1.2" fill="#CE93D8"/>
    </svg>`,
    isActive: true,
    description: '风吹草低'
  },
  {
    key: 'bg_sakura',
    name: '樱花林',
    slot: 'background',
    unlockType: 'tier',
    unlockTier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgs-sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FCE4EC"/>
          <stop offset="100%" stop-color="#F8BBD0"/>
        </linearGradient>
      </defs>
      <rect width="60" height="60" fill="url(#bgs-sky)"/>
      <!-- 远树 -->
      <ellipse cx="14" cy="30" rx="6" ry="14" fill="#F48FB1"/>
      <ellipse cx="46" cy="30" rx="6" ry="14" fill="#F48FB1"/>
      <ellipse cx="30" cy="24" rx="8" ry="18" fill="#F8BBD0"/>
      <line x1="14" y1="44" x2="14" y2="58" stroke="#5D4037" stroke-width="1"/>
      <line x1="30" y1="42" x2="30" y2="58" stroke="#5D4037" stroke-width="1"/>
      <line x1="46" y1="44" x2="46" y2="58" stroke="#5D4037" stroke-width="1"/>
      <!-- 飘瓣 -->
      <circle cx="8" cy="20" r="1.5" fill="#FF80AB"/>
      <circle cx="22" cy="10" r="1.2" fill="#FF80AB"/>
      <circle cx="38" cy="14" r="1.5" fill="#FF80AB"/>
      <circle cx="52" cy="22" r="1.2" fill="#FF80AB"/>
      <circle cx="6" cy="32" r="1" fill="#FF80AB"/>
      <circle cx="54" cy="40" r="1" fill="#FF80AB"/>
      <!-- 地面 -->
      <path d="M 0 56 L 60 56 L 60 60 L 0 60 Z" fill="#8D6E63"/>
    </svg>`,
    isActive: true,
    description: '粉色花海'
  },
  {
    key: 'bg_clouds',
    name: '云端',
    slot: 'background',
    unlockType: 'tier',
    unlockTier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgc-sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#42A5F5"/>
          <stop offset="100%" stop-color="#90CAF9"/>
        </linearGradient>
      </defs>
      <rect width="60" height="60" fill="url(#bgc-sky)"/>
      <!-- 太阳 -->
      <circle cx="48" cy="10" r="4" fill="#FFEB3B"/>
      <circle cx="48" cy="10" r="2" fill="#FFF59D"/>
      <!-- 大云 -->
      <ellipse cx="20" cy="20" rx="12" ry="6" fill="#fff" opacity="0.95"/>
      <ellipse cx="14" cy="18" rx="6" ry="4" fill="#fff" opacity="0.95"/>
      <ellipse cx="26" cy="22" rx="8" ry="5" fill="#fff" opacity="0.95"/>
      <!-- 中云 -->
      <ellipse cx="42" cy="32" rx="10" ry="5" fill="#fff" opacity="0.85"/>
      <ellipse cx="38" cy="30" rx="5" ry="3" fill="#fff" opacity="0.85"/>
      <!-- 前景云 -->
      <ellipse cx="16" cy="44" rx="14" ry="6" fill="#fff" opacity="0.9"/>
      <ellipse cx="40" cy="48" rx="12" ry="5" fill="#fff" opacity="0.85"/>
      <ellipse cx="28" cy="52" rx="14" ry="5" fill="#fff" opacity="0.9"/>
    </svg>`,
    isActive: true,
    description: '触手可及'
  },
  {
    key: 'bg_ocean',
    name: '深海',
    slot: 'background',
    unlockType: 'tier',
    unlockTier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgo-deep" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#0277BD"/>
          <stop offset="50%" stop-color="#01579B"/>
          <stop offset="100%" stop-color="#01579B"/>
        </linearGradient>
      </defs>
      <rect width="60" height="60" fill="url(#bgo-deep)"/>
      <!-- 光柱 -->
      <path d="M 20 0 L 16 60 L 24 60 L 28 0 Z" fill="#4FC3F7" opacity="0.3"/>
      <path d="M 38 0 L 36 60 L 44 60 L 46 0 Z" fill="#4FC3F7" opacity="0.3"/>
      <!-- 气泡 -->
      <circle cx="14" cy="20" r="1.5" fill="#B3E5FC" opacity="0.8"/>
      <circle cx="14" cy="14" r="1" fill="#B3E5FC" opacity="0.8"/>
      <circle cx="12" cy="8" r="0.8" fill="#B3E5FC" opacity="0.8"/>
      <circle cx="46" cy="24" r="1.5" fill="#B3E5FC" opacity="0.8"/>
      <circle cx="46" cy="16" r="1" fill="#B3E5FC" opacity="0.8"/>
      <circle cx="48" cy="10" r="0.8" fill="#B3E5FC" opacity="0.8"/>
      <circle cx="30" cy="40" r="1.2" fill="#B3E5FC" opacity="0.7"/>
      <circle cx="32" cy="34" r="0.8" fill="#B3E5FC" opacity="0.7"/>
      <!-- 鱼影 -->
      <path d="M 6 32 Q 10 30 14 32 Q 10 34 6 32 L 4 30 L 6 32 L 4 34 Z" fill="#4FC3F7" opacity="0.5"/>
      <path d="M 50 42 Q 54 40 58 42 Q 54 44 50 42 L 56 40 L 50 42 L 56 44 Z" fill="#4FC3F7" opacity="0.5"/>
    </svg>`,
    isActive: true,
    description: '蓝色深渊'
  },
  {
    key: 'bg_galaxy',
    name: '银河',
    slot: 'background',
    unlockType: 'tier',
    unlockTier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgg-galaxy" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#1A237E"/>
          <stop offset="50%" stop-color="#4A148C"/>
          <stop offset="100%" stop-color="#311B92"/>
        </linearGradient>
        <radialGradient id="bgg-nebula" cx="30%" cy="40%" r="40%">
          <stop offset="0%" stop-color="#E91E63" stop-opacity="0.6"/>
          <stop offset="100%" stop-color="#E91E63" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="60" height="60" fill="url(#bgg-galaxy)"/>
      <ellipse cx="18" cy="24" rx="20" ry="14" fill="url(#bgg-nebula)"/>
      <ellipse cx="44" cy="42" rx="18" ry="12" fill="url(#bgg-nebula)" opacity="0.6"/>
      <!-- 星 -->
      <circle cx="8" cy="8" r="1" fill="#FFEB3B"/>
      <circle cx="14" cy="14" r="0.6" fill="#fff"/>
      <circle cx="22" cy="6" r="0.8" fill="#fff"/>
      <circle cx="36" cy="10" r="1" fill="#FFEB3B"/>
      <circle cx="48" cy="14" r="0.6" fill="#fff"/>
      <circle cx="52" cy="6" r="1" fill="#FFEB3B"/>
      <circle cx="6" cy="30" r="0.8" fill="#fff"/>
      <circle cx="54" cy="32" r="1" fill="#FFEB3B"/>
      <circle cx="10" cy="48" r="0.6" fill="#fff"/>
      <circle cx="24" cy="52" r="1" fill="#FFEB3B"/>
      <circle cx="40" cy="54" r="0.8" fill="#fff"/>
      <circle cx="50" cy="50" r="1" fill="#FFEB3B"/>
      <!-- 流星 -->
      <line x1="6" y1="6" x2="12" y2="12" stroke="#fff" stroke-width="0.8" opacity="0.6"/>
    </svg>`,
    isActive: true,
    description: '宇宙尽览'
  },
  {
    key: 'bg_celestial',
    name: '天宫',
    slot: 'background',
    unlockType: 'tier',
    unlockTier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bgc-sky" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="#FFE0B2"/>
          <stop offset="50%" stop-color="#FFCC80"/>
          <stop offset="100%" stop-color="#FFAB91"/>
        </linearGradient>
      </defs>
      <rect width="60" height="60" fill="url(#bgc-sky)"/>
      <!-- 远山 -->
      <path d="M 0 40 L 12 32 L 24 38 L 36 30 L 48 36 L 60 32 L 60 60 L 0 60 Z" fill="#8D6E63" opacity="0.6"/>
      <!-- 云雾 -->
      <ellipse cx="20" cy="22" rx="14" ry="4" fill="#fff" opacity="0.7"/>
      <ellipse cx="42" cy="28" rx="12" ry="3" fill="#fff" opacity="0.6"/>
      <ellipse cx="14" cy="36" rx="10" ry="3" fill="#fff" opacity="0.7"/>
      <ellipse cx="46" cy="44" rx="14" ry="4" fill="#fff" opacity="0.6"/>
      <!-- 仙鹤 -->
      <path d="M 24 14 L 28 10 L 32 14 M 32 14 L 36 10" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <path d="M 36 10 L 38 8 L 40 10" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>
      <!-- 亭 -->
      <rect x="14" y="44" width="10" height="8" fill="#C62828"/>
      <path d="M 12 44 L 19 40 L 26 44 Z" fill="#B71C1C"/>
      <line x1="19" y1="48" x2="19" y2="52" stroke="#5D4037" stroke-width="1"/>
      <line x1="40" y1="50" x2="40" y2="54" stroke="#5D4037" stroke-width="1"/>
    </svg>`,
    isActive: true,
    description: '仙气缭绕'
  }
]

module.exports = ITEMS