'use strict'

/**
 * PetSpecies 种子数据（2026-06-22 user SVG 决策）。
 *
 * 每个 species 走 visualType='svg' + svgContent 内联。
 * 4 阶 × 4 种 = 16 条；设计原则：
 *   - 灵动可爱（眼高光、腮红、表情）
 *   - 颜色差异化（避免 16 只都灰白）
 *   - 用 viewBox 0 0 100 100 统一坐标系
 *   - 圆润线条（无锐角）
 *
 * 字段顺序与 PetSpecies.model.js 对齐：
 *   key, name, tier, visualType, imageFile, svgContent, weight, isActive, description
 */
const SPECIES = [
  /* ========== C 阶：常见小动物 ========== */

  // 橘猫 — 经典圆胖橘猫（眨眼 + 摇尾 + 呼吸）
  {
    key: 'cat_orange',
    name: '橘猫',
    tier: 'C',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="co-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFD591"/>
      <stop offset="100%" stop-color="#FA8C16"/>
    </radialGradient>
    <style>
      .co-breathe { transform-origin: 50px 60px; animation: co-breath 3s ease-in-out infinite; }
      .co-tail { transform-origin: 76px 60px; animation: co-tailwag 1.2s ease-in-out infinite; }
      .co-blink { animation: co-blink 4s ease-in-out infinite; }
      @keyframes co-breath { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.04,1.05); } }
      @keyframes co-tailwag { 0%,100% { transform: rotate(-12deg); } 50% { transform: rotate(18deg); } }
      @keyframes co-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
    </style>
  </defs>
  <g class="co-breathe">
    <!-- 尾巴（在身后） -->
    <g class="co-tail">
      <path d="M 76 60 Q 92 56 90 72 Q 86 86 74 78" fill="url(#co-body)" stroke="#D4380D" stroke-width="0.8"/>
      <path d="M 84 70 Q 88 72 86 76" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
    <!-- 身体 -->
    <ellipse cx="50" cy="62" rx="34" ry="28" fill="url(#co-body)"/>
    <!-- 耳朵 -->
    <path d="M 26 38 L 22 22 L 38 30 Z" fill="#FA8C16"/>
    <path d="M 74 38 L 78 22 L 62 30 Z" fill="#FA8C16"/>
    <path d="M 27 36 L 26 27 L 35 32 Z" fill="#FFADD2"/>
    <path d="M 73 36 L 74 27 L 65 32 Z" fill="#FFADD2"/>
    <!-- 头 -->
    <circle cx="50" cy="48" r="26" fill="url(#co-body)"/>
    <!-- 橘纹 -->
    <path d="M 30 45 Q 35 42 40 45" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M 60 45 Q 65 42 70 45" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M 32 56 Q 38 53 44 56" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M 56 56 Q 62 53 68 56" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <!-- 眼睛（眨眼） -->
    <g class="co-blink" style="transform-origin: 40px 50px">
      <ellipse cx="40" cy="50" rx="4" ry="5" fill="#262626"/>
      <circle cx="41" cy="48" r="1.5" fill="#fff"/>
    </g>
    <g class="co-blink" style="transform-origin: 60px 50px">
      <ellipse cx="60" cy="50" rx="4" ry="5" fill="#262626"/>
      <circle cx="61" cy="48" r="1.5" fill="#fff"/>
    </g>
    <!-- 鼻子嘴 -->
    <path d="M 48 56 L 52 56 L 50 59 Z" fill="#FF6B6B"/>
    <path d="M 50 59 Q 46 62 44 60" stroke="#262626" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M 50 59 Q 54 62 56 60" stroke="#262626" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <!-- 腮红 -->
    <circle cx="34" cy="56" r="3" fill="#FFADD2" opacity="0.6">
      <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="66" cy="56" r="3" fill="#FFADD2" opacity="0.6">
      <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2.5s" repeatCount="indefinite"/>
    </circle>
    <!-- 胡须 -->
    <line x1="30" y1="56" x2="22" y2="54" stroke="#262626" stroke-width="1"/>
    <line x1="30" y1="58" x2="22" y2="58" stroke="#262626" stroke-width="1"/>
    <line x1="70" y1="56" x2="78" y2="54" stroke="#262626" stroke-width="1"/>
    <line x1="70" y1="58" x2="78" y2="58" stroke="#262626" stroke-width="1"/>
  </g>
</svg>`,
    weight: 100,
    isActive: true,
    description: '圆圆胖胖的橘猫，慵懒可爱'
  },

  // 小奶狗 — 垂耳奶狗（垂耳摇 + 舌头伸缩 + 摇尾巴）
  {
    key: 'dog_puppy',
    name: '小奶狗',
    tier: 'C',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="dp-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFE7BA"/>
      <stop offset="100%" stop-color="#D4B373"/>
    </radialGradient>
    <style>
      .dp-bounce { transform-origin: 50px 80px; animation: dp-hop 0.6s ease-in-out infinite; }
      .dp-ear-l { transform-origin: 26px 42px; animation: dp-earl 1.6s ease-in-out infinite; }
      .dp-ear-r { transform-origin: 74px 42px; animation: dp-earr 1.6s ease-in-out infinite; }
      .dp-tongue { transform-origin: 50px 58px; animation: dp-pant 0.5s ease-in-out infinite; }
      .dp-tail { transform-origin: 12px 62px; animation: dp-tail 0.4s ease-in-out infinite; }
      .dp-blink { animation: dp-blink 4s ease-in-out infinite; }
      @keyframes dp-hop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes dp-earl { 0%,100% { transform: rotate(-15deg); } 50% { transform: rotate(-22deg); } }
      @keyframes dp-earr { 0%,100% { transform: rotate(15deg); } 50% { transform: rotate(22deg); } }
      @keyframes dp-pant { 0%,100% { transform: scale(1,1); } 50% { transform: scale(0.9,1.3); } }
      @keyframes dp-tail { 0%,100% { transform: rotate(-20deg); } 50% { transform: rotate(30deg); } }
      @keyframes dp-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
    </style>
  </defs>
  <g class="dp-bounce">
    <!-- 尾巴 -->
    <g class="dp-tail">
      <path d="M 12 62 Q -2 58 4 72 Q 6 80 14 76" fill="url(#dp-body)" stroke="#A0692A" stroke-width="0.8"/>
    </g>
    <!-- 身体 -->
    <ellipse cx="50" cy="65" rx="32" ry="25" fill="url(#dp-body)"/>
    <!-- 头 -->
    <circle cx="50" cy="46" r="26" fill="url(#dp-body)"/>
    <!-- 垂耳（摇） -->
    <ellipse class="dp-ear-l" cx="26" cy="52" rx="8" ry="14" fill="#A0692A"/>
    <ellipse class="dp-ear-r" cx="74" cy="52" rx="8" ry="14" fill="#A0692A"/>
    <!-- 眼（眨眼） -->
    <g class="dp-blink" style="transform-origin: 40px 48px">
      <ellipse cx="40" cy="48" rx="4.5" ry="5.5" fill="#262626"/>
      <circle cx="41" cy="46" r="1.8" fill="#fff"/>
    </g>
    <g class="dp-blink" style="transform-origin: 60px 48px">
      <ellipse cx="60" cy="48" rx="4.5" ry="5.5" fill="#262626"/>
      <circle cx="61" cy="46" r="1.8" fill="#fff"/>
    </g>
    <!-- 鼻 -->
    <ellipse cx="50" cy="56" rx="3.5" ry="2.5" fill="#262626"/>
    <!-- 嘴（吐舌，呼吸状伸缩） -->
    <path d="M 50 58 Q 50 64 46 64" stroke="#262626" stroke-width="1.5" fill="none"/>
    <path d="M 50 58 Q 50 64 54 64" stroke="#262626" stroke-width="1.5" fill="none"/>
    <ellipse class="dp-tongue" cx="50" cy="64" rx="3" ry="2" fill="#FF6B6B"/>
    <!-- 腮红 -->
    <circle cx="34" cy="56" r="3.5" fill="#FFADD2" opacity="0.7">
      <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="66" cy="56" r="3.5" fill="#FFADD2" opacity="0.7">
      <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>`,
    weight: 100,
    isActive: true,
    description: '软萌垂耳奶狗，摇尾巴等你'
  },

  // 小白兔 — 长耳红眼（长耳摇 + 眨眼 + 鼻动）
  {
    key: 'rabbit_white',
    name: '小白兔',
    tier: 'C',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="rb-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F0F0F0"/>
    </radialGradient>
    <style>
      .rb-ear-l { transform-origin: 38px 40px; animation: rb-earl 1.5s ease-in-out infinite; }
      .rb-ear-r { transform-origin: 62px 40px; animation: rb-earr 1.5s ease-in-out infinite; }
      .rb-nose { transform-origin: 50px 58px; animation: rb-nose 0.4s ease-in-out infinite; }
      .rb-blink { animation: rb-blink 3.5s ease-in-out infinite; }
      .rb-hop { transform-origin: 50px 88px; animation: rb-hop 2s ease-in-out infinite; }
      @keyframes rb-earl { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
      @keyframes rb-earr { 0%,100% { transform: rotate(8deg); } 50% { transform: rotate(-8deg); } }
      @keyframes rb-nose { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.15,0.9); } }
      @keyframes rb-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
      @keyframes rb-hop { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
    </style>
  </defs>
  <g class="rb-hop">
    <!-- 身体 -->
    <ellipse cx="50" cy="62" rx="32" ry="26" fill="url(#rb-body)" stroke="#E0E0E0" stroke-width="0.8"/>
    <!-- 长耳（左右交替摇） -->
    <g class="rb-ear-l">
      <ellipse cx="38" cy="22" rx="6" ry="18" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="0.8"/>
      <ellipse cx="38" cy="24" rx="3" ry="13" fill="#FFB6C1"/>
    </g>
    <g class="rb-ear-r">
      <ellipse cx="62" cy="22" rx="6" ry="18" fill="#FFFFFF" stroke="#E0E0E0" stroke-width="0.8"/>
      <ellipse cx="62" cy="24" rx="3" ry="13" fill="#FFB6C1"/>
    </g>
    <!-- 头 -->
    <circle cx="50" cy="50" r="24" fill="url(#rb-body)" stroke="#E0E0E0" stroke-width="0.8"/>
    <!-- 眼（红宝石，眨眼） -->
    <g class="rb-blink" style="transform-origin: 40px 52px">
      <ellipse cx="40" cy="52" rx="4" ry="5" fill="#FF4D4F"/>
      <circle cx="41" cy="50" r="1.5" fill="#fff"/>
    </g>
    <g class="rb-blink" style="transform-origin: 60px 52px">
      <ellipse cx="60" cy="52" rx="4" ry="5" fill="#FF4D4F"/>
      <circle cx="61" cy="50" r="1.5" fill="#fff"/>
    </g>
    <!-- 鼻嘴（Y 字，鼻头抖动） -->
    <g class="rb-nose">
      <path d="M 50 58 L 50 62" stroke="#FF6B6B" stroke-width="1.5"/>
      <path d="M 50 62 Q 46 66 44 64" stroke="#262626" stroke-width="1.5" fill="none"/>
      <path d="M 50 62 Q 54 66 56 64" stroke="#262626" stroke-width="1.5" fill="none"/>
    </g>
    <!-- 门牙 -->
    <rect x="47" y="64" width="2.5" height="4" fill="#fff" stroke="#E0E0E0" stroke-width="0.5"/>
    <rect x="50.5" y="64" width="2.5" height="4" fill="#fff" stroke="#E0E0E0" stroke-width="0.5"/>
    <!-- 腮红 -->
    <circle cx="34" cy="58" r="3" fill="#FFB6C1" opacity="0.7">
      <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="66" cy="58" r="3" fill="#FFB6C1" opacity="0.7">
      <animate attributeName="opacity" values="0.7;1;0.7" dur="2.2s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>`,
    weight: 100,
    isActive: true,
    description: '雪白长耳兔，门牙微露'
  },

  // 金丝熊 — 圆胖仓鼠（嘴嚼 + 眼眨 + 颊囊呼吸）
  {
    key: 'hamster_gold',
    name: '金丝熊',
    tier: 'C',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="hg-body" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#FFEAA7"/>
      <stop offset="100%" stop-color="#E8B339"/>
    </radialGradient>
    <style>
      .hg-breathe { transform-origin: 50px 56px; animation: hg-breath 2.5s ease-in-out infinite; }
      .hg-blink { animation: hg-blink 3s ease-in-out infinite; }
      .hg-mouth { transform-origin: 50px 64px; animation: hg-chew 0.4s ease-in-out infinite; }
      .hg-pouch-l { transform-origin: 28px 62px; animation: hg-pouch 1.2s ease-in-out infinite; }
      .hg-pouch-r { transform-origin: 72px 62px; animation: hg-pouch 1.2s ease-in-out infinite; }
      @keyframes hg-breath { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.03,1.04); } }
      @keyframes hg-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
      @keyframes hg-chew { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.3,0.7); } }
      @keyframes hg-pouch { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.1,1.15); } }
    </style>
  </defs>
  <g class="hg-breathe">
    <!-- 圆胖身体 -->
    <circle cx="50" cy="56" r="34" fill="url(#hg-body)"/>
    <!-- 头顶两小耳 -->
    <circle cx="36" cy="28" r="5" fill="#D49A2E"/>
    <circle cx="64" cy="28" r="5" fill="#D49A2E"/>
    <circle cx="36" cy="28" r="2.5" fill="#FFB6C1"/>
    <circle cx="64" cy="28" r="2.5" fill="#FFB6C1"/>
    <!-- 眼（大黑豆，眨眼） -->
    <g class="hg-blink" style="transform-origin: 38px 50px">
      <circle cx="38" cy="50" r="5.5" fill="#262626"/>
      <circle cx="39.5" cy="48" r="2" fill="#fff"/>
    </g>
    <g class="hg-blink" style="transform-origin: 62px 50px">
      <circle cx="62" cy="50" r="5.5" fill="#262626"/>
      <circle cx="63.5" cy="48" r="2" fill="#fff"/>
    </g>
    <!-- 嘴（笑脸 + 咀嚼） -->
    <g class="hg-mouth">
      <ellipse cx="50" cy="62" rx="2.5" ry="2" fill="#262626"/>
      <path d="M 50 64 Q 46 68 44 66" stroke="#262626" stroke-width="1.5" fill="none"/>
      <path d="M 50 64 Q 54 68 56 66" stroke="#262626" stroke-width="1.5" fill="none"/>
    </g>
    <!-- 腮红 -->
    <circle cx="30" cy="60" r="4" fill="#FFB6C1" opacity="0.6">
      <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="70" cy="60" r="4" fill="#FFB6C1" opacity="0.6">
      <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2s" repeatCount="indefinite"/>
    </circle>
    <!-- 颊囊鼓鼓（呼吸节奏） -->
    <ellipse class="hg-pouch-l" cx="28" cy="62" rx="6" ry="5" fill="#FFEAA7" stroke="#D49A2E" stroke-width="0.8"/>
    <ellipse class="hg-pouch-r" cx="72" cy="62" rx="6" ry="5" fill="#FFEAA7" stroke="#D49A2E" stroke-width="0.8"/>
  </g>
</svg>`,
    weight: 100,
    isActive: true,
    description: '颊囊鼓鼓，爱藏瓜子的小胖子'
  },

  /* ========== B 阶：稍珍稀 ========== */

  // 小狐狸 — 尖嘴大尾巴
  {
    key: 'fox_red',
    name: '小狐狸',
    tier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="fx-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFB37C"/>
      <stop offset="100%" stop-color="#E84B0F"/>
    </radialGradient>
  </defs>
  <!-- 大尾巴（背景） -->
  <path d="M 75 60 Q 92 50 88 75 Q 82 90 70 80 Z" fill="url(#fx-body)" stroke="#C73A06" stroke-width="0.8"/>
  <path d="M 84 70 Q 86 76 80 78" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- 身体 -->
  <ellipse cx="48" cy="62" rx="30" ry="26" fill="url(#fx-body)"/>
  <!-- 尖耳 -->
  <path d="M 30 30 L 26 14 L 42 26 Z" fill="#E84B0F"/>
  <path d="M 70 30 L 74 14 L 58 26 Z" fill="#E84B0F"/>
  <path d="M 32 28 L 30 18 L 39 25 Z" fill="#262626"/>
  <path d="M 68 28 L 70 18 L 61 25 Z" fill="#262626"/>
  <!-- 尖嘴 -->
  <path d="M 38 48 L 50 64 L 62 48 Z" fill="url(#fx-body)"/>
  <!-- 眼（杏眼媚） -->
  <ellipse cx="40" cy="46" rx="4" ry="3" fill="#262626"/>
  <ellipse cx="60" cy="46" rx="4" ry="3" fill="#262626"/>
  <circle cx="41" cy="45" r="1.2" fill="#fff"/>
  <circle cx="61" cy="45" r="1.2" fill="#fff"/>
  <!-- 鼻嘴 -->
  <ellipse cx="50" cy="58" rx="3" ry="2.2" fill="#262626"/>
  <path d="M 50 60 L 50 63" stroke="#262626" stroke-width="1.2"/>
  <path d="M 50 63 Q 47 66 46 64" stroke="#262626" stroke-width="1.2" fill="none"/>
  <path d="M 50 63 Q 53 66 54 64" stroke="#262626" stroke-width="1.2" fill="none"/>
  <!-- 腮红 -->
  <circle cx="36" cy="54" r="3" fill="#FF8F8F" opacity="0.6"/>
  <circle cx="64" cy="54" r="3" fill="#FF8F8F" opacity="0.6"/>
  <!-- 白肚 -->
  <ellipse cx="50" cy="72" rx="18" ry="10" fill="#FFF5E1"/>
</svg>`,
    weight: 100,
    isActive: true,
    description: '灵动小狐，机敏有灵气'
  },

  // 熊猫宝宝 — 黑眼圈
  {
    key: 'panda_baby',
    name: '熊猫宝宝',
    tier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="pb-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F0F0F0"/>
    </radialGradient>
  </defs>
  <!-- 身体 -->
  <ellipse cx="50" cy="62" rx="32" ry="26" fill="url(#pb-body)"/>
  <!-- 黑耳 -->
  <circle cx="28" cy="28" r="9" fill="#262626"/>
  <circle cx="72" cy="28" r="9" fill="#262626"/>
  <!-- 头 -->
  <circle cx="50" cy="48" r="26" fill="url(#pb-body)"/>
  <!-- 黑眼圈 -->
  <ellipse cx="40" cy="50" rx="7" ry="8" fill="#262626" transform="rotate(-15 40 50)"/>
  <ellipse cx="60" cy="50" rx="7" ry="8" fill="#262626" transform="rotate(15 60 50)"/>
  <!-- 白眼 -->
  <circle cx="40" cy="50" r="3" fill="#fff"/>
  <circle cx="60" cy="50" r="3" fill="#fff"/>
  <circle cx="40" cy="50" r="1.8" fill="#262626"/>
  <circle cx="60" cy="50" r="1.8" fill="#262626"/>
  <circle cx="40.8" cy="49" r="0.8" fill="#fff"/>
  <circle cx="60.8" cy="49" r="0.8" fill="#fff"/>
  <!-- 鼻嘴 -->
  <ellipse cx="50" cy="58" rx="3.5" ry="2.5" fill="#262626"/>
  <path d="M 50 60 L 50 63" stroke="#262626" stroke-width="1.5"/>
  <path d="M 50 63 Q 46 67 44 65" stroke="#262626" stroke-width="1.5" fill="none"/>
  <path d="M 50 63 Q 54 67 56 65" stroke="#262626" stroke-width="1.5" fill="none"/>
  <!-- 腮红 -->
  <circle cx="32" cy="58" r="3.5" fill="#FFB6C1" opacity="0.7"/>
  <circle cx="68" cy="58" r="3.5" fill="#FFB6C1" opacity="0.7"/>
</svg>`,
    weight: 100,
    isActive: true,
    description: '黑眼圈软萌，吃竹子的小团子'
  },

  // 小企鹅 — 黑背白肚
  {
    key: 'penguin_baby',
    name: '小企鹅',
    tier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="pg-belly" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E8F4F8"/>
    </radialGradient>
  </defs>
  <!-- 黑背 -->
  <ellipse cx="50" cy="56" rx="30" ry="34" fill="#262626"/>
  <!-- 白肚 -->
  <ellipse cx="50" cy="58" rx="22" ry="28" fill="url(#pg-belly)"/>
  <!-- 头 -->
  <circle cx="50" cy="38" r="22" fill="#262626"/>
  <!-- 白脸 -->
  <path d="M 36 38 Q 36 52 50 56 Q 64 52 64 38 Z" fill="url(#pg-belly)"/>
  <!-- 眼 -->
  <circle cx="42" cy="38" r="3" fill="#fff"/>
  <circle cx="58" cy="38" r="3" fill="#fff"/>
  <circle cx="42" cy="38" r="2" fill="#262626"/>
  <circle cx="58" cy="38" r="2" fill="#262626"/>
  <circle cx="42.5" cy="37.5" r="0.8" fill="#fff"/>
  <circle cx="58.5" cy="37.5" r="0.8" fill="#fff"/>
  <!-- 喙 -->
  <path d="M 44 46 L 56 46 L 50 52 Z" fill="#FF8C00"/>
  <!-- 鳍（翅膀） -->
  <ellipse cx="22" cy="58" rx="6" ry="14" fill="#262626" transform="rotate(-10 22 58)"/>
  <ellipse cx="78" cy="58" rx="6" ry="14" fill="#262626" transform="rotate(10 78 58)"/>
  <!-- 脚 -->
  <ellipse cx="40" cy="90" rx="8" ry="3" fill="#FF8C00"/>
  <ellipse cx="60" cy="90" rx="8" ry="3" fill="#FF8C00"/>
  <!-- 腮红 -->
  <circle cx="34" cy="48" r="3" fill="#FFB6C1" opacity="0.7"/>
  <circle cx="66" cy="48" r="3" fill="#FFB6C1" opacity="0.7"/>
</svg>`,
    weight: 100,
    isActive: true,
    description: '黑背白肚小企鹅，呆萌走路'
  },

  // 角鸮 — 大眼猫头鹰
  {
    key: 'owl_horned',
    name: '角鸮',
    tier: 'B',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="oh-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#C8A977"/>
      <stop offset="100%" stop-color="#7B5E2C"/>
    </radialGradient>
  </defs>
  <!-- 身体 -->
  <ellipse cx="50" cy="58" rx="30" ry="32" fill="url(#oh-body)"/>
  <!-- 角羽 -->
  <path d="M 28 30 L 26 16 L 36 26 Z" fill="#5C4520"/>
  <path d="M 72 30 L 74 16 L 64 26 Z" fill="#5C4520"/>
  <!-- 大眼盘 -->
  <circle cx="38" cy="46" r="12" fill="#F5E8C8"/>
  <circle cx="62" cy="46" r="12" fill="#F5E8C8"/>
  <!-- 大瞳孔 -->
  <circle cx="38" cy="46" r="8" fill="#262626"/>
  <circle cx="62" cy="46" r="8" fill="#262626"/>
  <circle cx="40" cy="44" r="3" fill="#FFD700"/>
  <circle cx="64" cy="44" r="3" fill="#FFD700"/>
  <circle cx="40" cy="44" r="1.5" fill="#262626"/>
  <circle cx="64" cy="44" r="1.5" fill="#262626"/>
  <!-- 喙 -->
  <path d="M 46 56 L 54 56 L 50 64 Z" fill="#FF8C00"/>
  <!-- 胸前羽毛斑 -->
  <path d="M 38 70 Q 42 66 46 70" stroke="#5C4520" stroke-width="1.5" fill="none"/>
  <path d="M 54 70 Q 58 66 62 70" stroke="#5C4520" stroke-width="1.5" fill="none"/>
  <path d="M 42 78 Q 46 74 50 78" stroke="#5C4520" stroke-width="1.5" fill="none"/>
  <path d="M 50 78 Q 54 74 58 78" stroke="#5C4520" stroke-width="1.5" fill="none"/>
  <!-- 腮红 -->
  <circle cx="30" cy="58" r="2.5" fill="#FFB6C1" opacity="0.5"/>
  <circle cx="70" cy="58" r="2.5" fill="#FFB6C1" opacity="0.5"/>
</svg>`,
    weight: 100,
    isActive: true,
    description: '大眼睛夜行精灵，聪慧灵动'
  },

  /* ========== A 阶：珍稀野生动物 ========== */

  // 北极狼 — 银白尖耳（狼啸 + 耳动 + 寒气）
  {
    key: 'wolf_arctic',
    name: '北极狼',
    tier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="wa-body" cx="50%" cy="35%" r="70%">
      <stop offset="0%" stop-color="#F5F7FA"/>
      <stop offset="100%" stop-color="#B0BEC5"/>
    </radialGradient>
    <style>
      .wa-ear-l { transform-origin: 30px 28px; animation: wa-earl 2s ease-in-out infinite; }
      .wa-ear-r { transform-origin: 70px 28px; animation: wa-earr 2s ease-in-out infinite; }
      .wa-blink { animation: wa-blink 4s ease-in-out infinite; }
      .wa-mouth { transform-origin: 50px 63px; animation: wa-howl 3.5s ease-in-out infinite; }
      .wa-breath { transform-origin: 50px 60px; animation: wa-breath 3s ease-in-out infinite; }
      @keyframes wa-earl { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-8deg); } }
      @keyframes wa-earr { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(8deg); } }
      @keyframes wa-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
      @keyframes wa-howl { 0%,100% { transform: scale(1,1); } 30% { transform: scale(1,1); } 45% { transform: scale(1.2,0.5); } 60% { transform: scale(1,1); } }
      @keyframes wa-breath { 0%,100% { transform: scale(1,1); } 50% { transform: scale(1.04,1.06); } }
    </style>
  </defs>
  <!-- 寒气（北风阵阵） -->
  <g opacity="0.6">
    <ellipse cx="6" cy="50" rx="4" ry="1.5" fill="#E1F5FE">
      <animate attributeName="cx" values="6;14;6" dur="3s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.6;0" dur="3s" repeatCount="indefinite"/>
    </ellipse>
    <ellipse cx="94" cy="60" rx="4" ry="1.5" fill="#E1F5FE">
      <animate attributeName="cx" values="94;86;94" dur="3.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;0.6;0" dur="3.5s" repeatCount="indefinite"/>
    </ellipse>
  </g>
  <g class="wa-breath">
    <!-- 身体（银白） -->
    <ellipse cx="50" cy="62" rx="32" ry="28" fill="url(#wa-body)"/>
    <!-- 头 -->
    <ellipse cx="50" cy="48" rx="26" ry="24" fill="url(#wa-body)"/>
    <!-- 尖耳（警觉转动） -->
    <g class="wa-ear-l">
      <path d="M 28 30 L 22 12 L 38 24 Z" fill="#B0BEC5"/>
      <path d="M 30 28 L 28 18 L 36 24 Z" fill="#FFB6C1"/>
    </g>
    <g class="wa-ear-r">
      <path d="M 72 30 L 78 12 L 62 24 Z" fill="#B0BEC5"/>
      <path d="M 70 28 L 72 18 L 64 24 Z" fill="#FFB6C1"/>
    </g>
    <!-- 冷峻眼（蓝，眨眼） -->
    <g class="wa-blink" style="transform-origin: 40px 48px">
      <ellipse cx="40" cy="48" rx="4" ry="5" fill="#1A237E"/>
      <circle cx="41" cy="46" r="1.5" fill="#fff"/>
    </g>
    <g class="wa-blink" style="transform-origin: 60px 48px">
      <ellipse cx="60" cy="48" rx="4" ry="5" fill="#1A237E"/>
      <circle cx="61" cy="46" r="1.5" fill="#fff"/>
    </g>
    <!-- 鼻嘴（嚎叫时张大） -->
    <ellipse cx="50" cy="58" rx="3" ry="2.5" fill="#262626"/>
    <g class="wa-mouth">
      <path d="M 50 60 L 50 63" stroke="#262626" stroke-width="1.5"/>
      <path d="M 50 63 Q 47 66 46 65" stroke="#262626" stroke-width="1.5" fill="none"/>
      <path d="M 50 63 Q 53 66 54 65" stroke="#262626" stroke-width="1.5" fill="none"/>
    </g>
    <!-- 眉骨（英气） -->
    <path d="M 32 40 Q 38 36 44 40" stroke="#5C6BC0" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M 56 40 Q 62 36 68 40" stroke="#5C6BC0" stroke-width="2" fill="none" stroke-linecap="round"/>
  </g>
</svg>`,
    weight: 100,
    isActive: true,
    description: '冷峻银白，气质凛然'
  },

  // 白鹿 — 仙气飘飘（角光晕 + 斑点飘 + 眨眼）
  {
    key: 'deer_white',
    name: '白鹿',
    tier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="dw-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F0E8E0"/>
    </radialGradient>
    <radialGradient id="dw-glow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFE082" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#FFE082" stop-opacity="0"/>
    </radialGradient>
    <style>
      .dw-horn { transform-origin: 50px 30px; animation: dw-glow 2.5s ease-in-out infinite; }
      .dw-blink { animation: dw-blink 4s ease-in-out infinite; }
      .dw-spot1 { animation: dw-fade1 3s ease-in-out infinite; }
      .dw-spot2 { animation: dw-fade2 3s ease-in-out infinite 0.5s; }
      .dw-spot3 { animation: dw-fade3 3s ease-in-out infinite 1s; }
      .dw-spot4 { animation: dw-fade4 3s ease-in-out infinite 1.5s; }
      @keyframes dw-glow { 0%,100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
      @keyframes dw-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
      @keyframes dw-fade1 { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes dw-fade2 { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes dw-fade3 { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
      @keyframes dw-fade4 { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    </style>
  </defs>
  <!-- 鹿角金光晕 -->
  <ellipse class="dw-horn" cx="50" cy="20" rx="30" ry="14" fill="url(#dw-glow)"/>
  <!-- 身体 -->
  <ellipse cx="50" cy="62" rx="30" ry="26" fill="url(#dw-body)"/>
  <!-- 头 -->
  <ellipse cx="50" cy="48" rx="22" ry="20" fill="url(#dw-body)"/>
  <!-- 鹿角（金色分叉） -->
  <g class="dw-horn">
    <path d="M 35 30 L 30 14 M 30 14 L 22 8 M 30 14 L 28 18" stroke="#C9A961" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M 35 30 L 32 22" stroke="#C9A961" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M 65 30 L 70 14 M 70 14 L 78 8 M 70 14 L 72 18" stroke="#C9A961" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M 65 30 L 68 22" stroke="#C9A961" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  </g>
  <!-- 大温柔眼（眨眼） -->
  <g class="dw-blink" style="transform-origin: 42px 50px">
    <ellipse cx="42" cy="50" rx="3.5" ry="5" fill="#5D4037"/>
    <circle cx="43" cy="48" r="1.5" fill="#fff"/>
  </g>
  <g class="dw-blink" style="transform-origin: 58px 50px">
    <ellipse cx="58" cy="50" rx="3.5" ry="5" fill="#5D4037"/>
    <circle cx="59" cy="48" r="1.5" fill="#fff"/>
  </g>
  <!-- 鼻嘴 -->
  <ellipse cx="50" cy="58" rx="2.5" ry="2" fill="#8D6E63"/>
  <path d="M 50 60 L 50 63" stroke="#8D6E63" stroke-width="1.5"/>
  <path d="M 50 63 Q 47 66 46 64" stroke="#8D6E63" stroke-width="1.5" fill="none"/>
  <path d="M 50 63 Q 53 66 54 64" stroke="#8D6E63" stroke-width="1.5" fill="none"/>
  <!-- 斑点（呼吸闪烁） -->
  <circle class="dw-spot1" cx="38" cy="68" r="1.5" fill="#F0E0D0"/>
  <circle class="dw-spot2" cx="46" cy="74" r="1.5" fill="#F0E0D0"/>
  <circle class="dw-spot3" cx="58" cy="72" r="1.5" fill="#F0E0D0"/>
  <circle class="dw-spot4" cx="62" cy="64" r="1.5" fill="#F0E0D0"/>
  <!-- 腮红 -->
  <circle cx="34" cy="56" r="3" fill="#FFB6C1" opacity="0.6">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="66" cy="56" r="3" fill="#FFB6C1" opacity="0.6">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`,
    weight: 100,
    isActive: true,
    description: '仙气飘飘的白鹿，温润如玉'
  },

  // 赤鸢 — 红羽猛禽（展翅扇动 + 凶猛盯视）
  {
    key: 'hawk_red',
    name: '赤鸢',
    tier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="hr-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFAB91"/>
      <stop offset="100%" stop-color="#C73A06"/>
    </radialGradient>
    <style>
      .hr-wing-l { transform-origin: 32px 38px; animation: hr-wingl 0.7s ease-in-out infinite; }
      .hr-wing-r { transform-origin: 68px 38px; animation: hr-wingr 0.7s ease-in-out infinite; }
      .hr-blink { animation: hr-blink 5s ease-in-out infinite; }
      .hr-pupil { transform-origin: 42px 40px; animation: hr-stare 4s ease-in-out infinite; }
      .hr-pupil-r { transform-origin: 58px 40px; animation: hr-stare 4s ease-in-out infinite; }
      @keyframes hr-wingl { 0%,100% { transform: rotate(0deg) scaleY(1); } 50% { transform: rotate(-6deg) scaleY(0.92); } }
      @keyframes hr-wingr { 0%,100% { transform: rotate(0deg) scaleY(1); } 50% { transform: rotate(6deg) scaleY(0.92); } }
      @keyframes hr-blink { 0%,95%,100% { transform: scaleY(1); } 97% { transform: scaleY(0.1); } }
      @keyframes hr-stare { 0%,100% { transform: translateX(0); } 50% { transform: translateX(1px); } }
    </style>
  </defs>
  <!-- 展开翅（扇动） -->
  <g class="hr-wing-l">
    <path d="M 22 48 Q 8 30 14 22 Q 22 18 32 38 Z" fill="url(#hr-body)"/>
    <path d="M 16 28 Q 20 32 26 36" stroke="#C73A06" stroke-width="1" fill="none"/>
    <path d="M 16 34 Q 22 38 28 40" stroke="#C73A06" stroke-width="1" fill="none"/>
  </g>
  <g class="hr-wing-r">
    <path d="M 78 48 Q 92 30 86 22 Q 78 18 68 38 Z" fill="url(#hr-body)"/>
    <path d="M 84 28 Q 80 32 74 36" stroke="#C73A06" stroke-width="1" fill="none"/>
    <path d="M 84 34 Q 78 38 72 40" stroke="#C73A06" stroke-width="1" fill="none"/>
  </g>
  <!-- 身体 -->
  <ellipse cx="50" cy="60" rx="22" ry="26" fill="url(#hr-body)"/>
  <!-- 头 -->
  <circle cx="50" cy="40" r="20" fill="url(#hr-body)"/>
  <!-- 凶猛眼（盯视，眨眼极慢） -->
  <g style="transform-origin: 42px 40px">
    <circle cx="42" cy="40" r="4.5" fill="#FFEB3B"/>
    <circle class="hr-pupil" cx="42" cy="40" r="2.5" fill="#262626"/>
    <circle cx="42.5" cy="39.5" r="0.8" fill="#fff"/>
  </g>
  <g style="transform-origin: 58px 40px">
    <circle cx="58" cy="40" r="4.5" fill="#FFEB3B"/>
    <circle class="hr-pupil-r" cx="58" cy="40" r="2.5" fill="#262626"/>
    <circle cx="58.5" cy="39.5" r="0.8" fill="#fff"/>
  </g>
  <!-- 上下眼睑（眨眼） -->
  <g class="hr-blink" style="transform-origin: 50px 40px">
    <ellipse cx="50" cy="40" rx="22" ry="20" fill="none"/>
  </g>
  <!-- 尖喙（钩） -->
  <path d="M 44 48 L 56 48 L 50 60 Z" fill="#FF8F00"/>
  <path d="M 50 56 L 50 60" stroke="#C73A06" stroke-width="1"/>
</svg>`,
    weight: 100,
    isActive: true,
    description: '红羽猛禽，展翅高飞'
  },

  // 蓝海豚 — 流线型（跃出水面 + 浪花 + 游动摇摆）
  {
    key: 'dolphin_blue',
    name: '蓝海豚',
    tier: 'A',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="dl-body" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#73D0F5"/>
      <stop offset="100%" stop-color="#1976D2"/>
    </linearGradient>
    <style>
      .dl-swim { transform-origin: 50px 80px; animation: dl-swim 2.5s ease-in-out infinite; }
      .dl-flipper { transform-origin: 30px 60px; animation: dl-flip 1.25s ease-in-out infinite; }
      .dl-tail { transform-origin: 14px 56px; animation: dl-tail 1.25s ease-in-out infinite; }
      .dl-blink { animation: dl-blink 4s ease-in-out infinite; }
      @keyframes dl-swim { 0%,100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-3px) rotate(-2deg); } }
      @keyframes dl-flip { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-12deg); } }
      @keyframes dl-tail { 0%,100% { transform: rotate(-15deg); } 50% { transform: rotate(15deg); } }
      @keyframes dl-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
    </style>
  </defs>
  <!-- 浪花 -->
  <g>
    <circle cx="14" cy="84" r="3" fill="#E1F5FE" opacity="0.8">
      <animate attributeName="cy" values="84;78;84" dur="1.5s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="86" cy="84" r="3" fill="#E1F5FE" opacity="0.8">
      <animate attributeName="cy" values="84;78;84" dur="1.5s" repeatCount="indefinite" begin="0.5s"/>
      <animate attributeName="opacity" values="0.8;0;0.8" dur="1.5s" repeatCount="indefinite" begin="0.5s"/>
    </circle>
    <circle cx="30" cy="86" r="2" fill="#E1F5FE" opacity="0.6">
      <animate attributeName="cy" values="86;80;86" dur="1.8s" repeatCount="indefinite" begin="0.3s"/>
    </circle>
    <circle cx="70" cy="86" r="2" fill="#E1F5FE" opacity="0.6">
      <animate attributeName="cy" values="86;80;86" dur="1.8s" repeatCount="indefinite" begin="0.8s"/>
    </circle>
  </g>
  <!-- 海平面 -->
  <line x1="0" y1="90" x2="100" y2="90" stroke="#1976D2" stroke-width="2" opacity="0.6"/>
  <g class="dl-swim">
    <!-- 流线身体 -->
    <path d="M 14 56 Q 24 30 50 30 Q 76 30 86 56 Q 76 76 50 76 Q 24 76 14 56 Z" fill="url(#dl-body)"/>
    <!-- 浅色肚 -->
    <path d="M 22 64 Q 38 76 62 76 Q 76 72 82 64 Q 70 70 50 70 Q 30 70 22 64 Z" fill="#B3E5FC"/>
    <!-- 嘴（尖笑） -->
    <path d="M 78 56 Q 92 52 92 60 Q 92 64 80 62" fill="url(#dl-body)"/>
    <!-- 鳍（划动） -->
    <g class="dl-flipper">
      <path d="M 30 60 L 22 80 L 38 70 Z" fill="#1565C0"/>
    </g>
    <!-- 尾鳍（左右甩） -->
    <g class="dl-tail">
      <path d="M 14 56 L 4 44 L 14 52 Z" fill="#1565C0"/>
      <path d="M 14 56 L 4 68 L 14 60 Z" fill="#1565C0"/>
    </g>
    <!-- 眼（眨眼） -->
    <g class="dl-blink" style="transform-origin: 68px 46px">
      <circle cx="68" cy="46" r="3.5" fill="#262626"/>
      <circle cx="69" cy="45" r="1.2" fill="#fff"/>
    </g>
    <!-- 微笑 -->
    <path d="M 78 56 Q 84 60 88 56" stroke="#0D47A1" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <!-- 鳃 -->
    <path d="M 62 56 L 62 64" stroke="#0D47A1" stroke-width="1"/>
    <path d="M 66 56 L 66 64" stroke="#0D47A1" stroke-width="1"/>
  </g>
</svg>`,
    weight: 100,
    isActive: true,
    description: '流线蓝海豚，跃出浪花'
  },

  /* ========== S 阶：神话级 ========== */

  // 应龙 — 金鳞带翼（火焰珠旋转 + 龙身盘旋 + 翼扇 + 鳞光）
  {
    key: 'dragon_emperor',
    name: '应龙',
    tier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="de-body" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFD54F"/>
      <stop offset="50%" stop-color="#FF8F00"/>
      <stop offset="100%" stop-color="#C62828"/>
    </linearGradient>
    <radialGradient id="de-flame" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFEB3B"/>
      <stop offset="50%" stop-color="#FF6F00"/>
      <stop offset="100%" stop-color="#D32F2F" stop-opacity="0.8"/>
    </radialGradient>
    <style>
      .de-spin { transform-origin: 14px 20px; animation: de-spin 2s linear infinite; }
      .de-wing-l { transform-origin: 50px 56px; animation: de-wingl 1.2s ease-in-out infinite; }
      .de-wing-r { transform-origin: 64px 50px; animation: de-wingr 1.2s ease-in-out infinite; }
      .de-glow { transform-origin: 50px 60px; animation: de-glow 2s ease-in-out infinite; }
      .de-eye { transform-origin: 78px 46px; animation: de-eye 3s ease-in-out infinite; }
      @keyframes de-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes de-wingl { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.85) scaleX(1.05); } }
      @keyframes de-wingr { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.85) scaleX(1.05); } }
      @keyframes de-glow { 0%,100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.05); } }
      @keyframes de-eye { 0%,100% { filter: drop-shadow(0 0 1px #fff); } 50% { filter: drop-shadow(0 0 4px #FF1744); } }
    </style>
  </defs>
  <!-- 龙气光环 -->
  <ellipse class="de-glow" cx="50" cy="60" rx="40" ry="20" fill="#FFE082" opacity="0.6"/>
  <!-- 龙身（蛇形，stroke-dasharray 模拟鳞光） -->
  <path d="M 20 70 Q 30 50 38 60 Q 46 70 50 56 Q 54 42 64 50 Q 74 58 80 44" stroke="url(#de-body)" stroke-width="14" fill="none" stroke-linecap="round"/>
  <!-- 龙翼（扇动） -->
  <g class="de-wing-l">
    <path d="M 50 56 Q 38 30 28 28 Q 36 38 40 50 Z" fill="url(#de-body)" stroke="#C62828" stroke-width="0.5"/>
  </g>
  <g class="de-wing-r">
    <path d="M 64 50 Q 76 24 86 22 Q 78 32 74 44 Z" fill="url(#de-body)" stroke="#C62828" stroke-width="0.5"/>
  </g>
  <!-- 龙角 -->
  <path d="M 76 42 L 86 32 L 80 42 Z" fill="#FFD54F"/>
  <path d="M 82 40 L 92 32 L 86 42 Z" fill="#FF8F00"/>
  <!-- 龙须（飘动） -->
  <path d="M 84 48 Q 90 54 88 60" stroke="#FF8F00" stroke-width="1.5" fill="none" stroke-linecap="round">
    <animate attributeName="d" values="M 84 48 Q 90 54 88 60;M 84 48 Q 94 56 90 62;M 84 48 Q 90 54 88 60" dur="1.8s" repeatCount="indefinite"/>
  </path>
  <path d="M 86 50 Q 94 58 92 64" stroke="#FF8F00" stroke-width="1.5" fill="none" stroke-linecap="round">
    <animate attributeName="d" values="M 86 50 Q 94 58 92 64;M 86 50 Q 98 60 96 66;M 86 50 Q 94 58 92 64" dur="2s" repeatCount="indefinite"/>
  </path>
  <!-- 龙眼（发光 + 缩放脉冲） -->
  <g class="de-eye">
    <circle cx="78" cy="46" r="3" fill="#fff"/>
    <circle cx="78" cy="46" r="2" fill="#C62828"/>
    <circle cx="78.5" cy="45.5" r="0.6" fill="#fff"/>
  </g>
  <!-- 火焰珠（旋转 + 焰尖抖动） -->
  <g class="de-spin">
    <circle cx="14" cy="20" r="6" fill="url(#de-flame)"/>
    <circle cx="14" cy="20" r="3" fill="#FFEB3B"/>
  </g>
  <g stroke="#FF6F00" stroke-width="1.5" stroke-linecap="round" fill="none">
    <path d="M 8 18 L 4 14">
      <animate attributeName="d" values="M 8 18 L 4 14;M 8 18 L 2 12;M 8 18 L 4 14" dur="0.6s" repeatCount="indefinite"/>
    </path>
    <path d="M 20 18 L 24 14">
      <animate attributeName="d" values="M 20 18 L 24 14;M 20 18 L 26 12;M 20 18 L 24 14" dur="0.7s" repeatCount="indefinite"/>
    </path>
    <path d="M 8 22 L 4 26">
      <animate attributeName="d" values="M 8 22 L 4 26;M 8 22 L 2 28;M 8 22 L 4 26" dur="0.65s" repeatCount="indefinite"/>
    </path>
    <path d="M 20 22 L 24 26">
      <animate attributeName="d" values="M 20 22 L 24 26;M 20 22 L 26 28;M 20 22 L 24 26" dur="0.55s" repeatCount="indefinite"/>
    </path>
  </g>
  <!-- 鳞片（呼吸光） -->
  <path d="M 30 65 Q 33 62 36 65" stroke="#C62828" stroke-width="1" fill="none">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/>
  </path>
  <path d="M 40 65 Q 43 62 46 65" stroke="#C62828" stroke-width="1" fill="none">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" begin="0.3s"/>
  </path>
  <path d="M 56 52 Q 59 49 62 52" stroke="#C62828" stroke-width="1" fill="none">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" begin="0.6s"/>
  </path>
</svg>`,
    weight: 100,
    isActive: true,
    description: '金鳞带翼，火焰为伴'
  },

  // 朱雀 — 红金羽神鸟（尾羽飘 + 翅展 + 冠羽飘 + 火苗）
  {
    key: 'phoenix_fire',
    name: '朱雀',
    tier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="pf-body" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE082"/>
      <stop offset="50%" stop-color="#FF6F00"/>
      <stop offset="100%" stop-color="#D32F2F"/>
    </linearGradient>
    <linearGradient id="pf-tail" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FF6F00"/>
      <stop offset="100%" stop-color="#FF1744"/>
    </linearGradient>
    <radialGradient id="pf-aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFEB3B" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#FF6F00" stop-opacity="0"/>
    </radialGradient>
    <style>
      .pf-tail-l { transform-origin: 30px 60px; animation: pf-taill 2s ease-in-out infinite; }
      .pf-tail-m { transform-origin: 40px 66px; animation: pf-tailm 2.2s ease-in-out infinite; }
      .pf-tail-r { transform-origin: 50px 70px; animation: pf-tailr 2.4s ease-in-out infinite; }
      .pf-wing { transform-origin: 50px 42px; animation: pf-wing 1.5s ease-in-out infinite; }
      .pf-crest-l { transform-origin: 62px 24px; animation: pf-crestl 1.8s ease-in-out infinite; }
      .pf-crest-m { transform-origin: 66px 26px; animation: pf-crestm 2s ease-in-out infinite; }
      .pf-crest-r { transform-origin: 72px 28px; animation: pf-crestr 2.2s ease-in-out infinite; }
      .pf-eye { animation: pf-eye 3s ease-in-out infinite; }
      .pf-aura-anim { transform-origin: 58px 52px; animation: pf-aura 2.5s ease-in-out infinite; }
      @keyframes pf-taill { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-4deg); } }
      @keyframes pf-tailm { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(3deg); } }
      @keyframes pf-tailr { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-2deg); } }
      @keyframes pf-wing { 0%,100% { transform: scaleY(1); } 50% { transform: scaleY(0.92) scaleX(1.05); } }
      @keyframes pf-crestl { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-6deg); } }
      @keyframes pf-crestm { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(4deg); } }
      @keyframes pf-crestr { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-3deg); } }
      @keyframes pf-eye { 0%,90%,100% { transform: scaleY(1); } 93% { transform: scaleY(0.1); } }
      @keyframes pf-aura { 0%,100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
    </style>
  </defs>
  <!-- 朱雀神火光环 -->
  <circle class="pf-aura-anim" cx="58" cy="52" r="36" fill="url(#pf-aura)"/>
  <!-- 长尾羽（三束飘） -->
  <path class="pf-tail-l" d="M 30 60 Q 10 80 6 90 Q 18 80 28 70 Z" fill="url(#pf-tail)"/>
  <path class="pf-tail-m" d="M 40 66 Q 22 88 14 96 Q 30 84 38 76 Z" fill="url(#pf-tail)"/>
  <path class="pf-tail-r" d="M 50 70 Q 36 92 28 98 Q 46 86 50 80 Z" fill="url(#pf-tail)"/>
  <!-- 身体 -->
  <ellipse cx="58" cy="52" rx="22" ry="20" fill="url(#pf-body)"/>
  <!-- 翅（扇动） -->
  <g class="pf-wing">
    <path d="M 50 42 Q 30 20 20 22 Q 32 30 44 42 Z" fill="url(#pf-body)" stroke="#D32F2F" stroke-width="0.5"/>
    <path d="M 24 28 Q 26 34 32 38" stroke="#D32F2F" stroke-width="0.8" fill="none"/>
    <path d="M 28 32 Q 30 38 36 42" stroke="#D32F2F" stroke-width="0.8" fill="none"/>
  </g>
  <!-- 头 -->
  <circle cx="62" cy="38" r="14" fill="url(#pf-body)"/>
  <!-- 冠羽（三飘） -->
  <path class="pf-crest-l" d="M 60 24 L 56 12 L 64 22 Z" fill="#D32F2F"/>
  <path class="pf-crest-m" d="M 66 26 L 64 14 L 70 24 Z" fill="#FF6F00"/>
  <path class="pf-crest-r" d="M 70 28 L 72 16 L 76 28 Z" fill="#FFE082"/>
  <!-- 眼（眨眼） -->
  <g class="pf-eye" style="transform-origin: 64px 36px">
    <circle cx="64" cy="36" r="2.5" fill="#fff"/>
    <circle cx="64" cy="36" r="1.5" fill="#D32F2F"/>
  </g>
  <!-- 喙 -->
  <path d="M 70 42 L 80 38 L 70 44 Z" fill="#FFA000"/>
  <!-- 胸前羽 -->
  <path d="M 50 56 Q 54 52 58 56" stroke="#D32F2F" stroke-width="1" fill="none">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite"/>
  </path>
  <path d="M 56 62 Q 60 58 64 62" stroke="#D32F2F" stroke-width="1" fill="none">
    <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" begin="0.5s"/>
  </path>
  <!-- 火苗粒子 -->
  <circle cx="14" cy="6" r="1.2" fill="#FF6F00">
    <animate attributeName="cy" values="6;0;6" dur="1.4s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="0.8;0;0.8" dur="1.4s" repeatCount="indefinite"/>
  </circle>
  <circle cx="90" cy="8" r="1.2" fill="#FFEB3B">
    <animate attributeName="cy" values="8;2;8" dur="1.6s" repeatCount="indefinite" begin="0.3s"/>
    <animate attributeName="opacity" values="0.8;0;0.8" dur="1.6s" repeatCount="indefinite" begin="0.3s"/>
  </circle>
</svg>`,
    weight: 100,
    isActive: true,
    description: '红金羽神鸟，浴火重生'
  },

  // 独角兽 — 彩虹鬃毛（彩虹光晕 + 鬃毛飘 + 角光柱 + 星尘）
  {
    key: 'unicorn_rainbow',
    name: '独角兽',
    tier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="ur-body" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F5F0FF"/>
    </radialGradient>
    <linearGradient id="ur-mane" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FF6B9D"/>
      <stop offset="33%" stop-color="#FFB74D"/>
      <stop offset="66%" stop-color="#81D4FA"/>
      <stop offset="100%" stop-color="#AED581"/>
    </linearGradient>
    <radialGradient id="ur-aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFE082" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#FFE082" stop-opacity="0"/>
    </radialGradient>
    <style>
      .ur-horn-glow { transform-origin: 50px 18px; animation: ur-hornglow 2s ease-in-out infinite; }
      .ur-beam { transform-origin: 50px 26px; animation: ur-beam 2s ease-in-out infinite; }
      .ur-mane-l { transform-origin: 22px 44px; animation: ur-manel 1.5s ease-in-out infinite; }
      .ur-mane-r { transform-origin: 78px 44px; animation: ur-maner 1.5s ease-in-out infinite; }
      .ur-blink { animation: ur-blink 4s ease-in-out infinite; }
      .ur-aura-anim { transform-origin: 50px 50px; animation: ur-aura 3s ease-in-out infinite; }
      @keyframes ur-hornglow { 0%,100% { opacity: 0.6; transform: scale(1); } 50% { opacity: 1; transform: scale(1.4); } }
      @keyframes ur-beam { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
      @keyframes ur-manel { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(3deg); } }
      @keyframes ur-maner { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(-3deg); } }
      @keyframes ur-blink { 0%,92%,100% { transform: scaleY(1); } 95% { transform: scaleY(0.1); } }
      @keyframes ur-aura { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
    </style>
  </defs>
  <!-- 彩虹光晕 -->
  <circle class="ur-aura-anim" cx="50" cy="50" r="48" fill="url(#ur-aura)"/>
  <!-- 星光粒子 -->
  <g>
    <circle cx="10" cy="30" r="1.2" fill="#FFEB3B">
      <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/>
    </circle>
    <circle cx="90" cy="40" r="1" fill="#FF80AB">
      <animate attributeName="opacity" values="0;1;0" dur="2.5s" repeatCount="indefinite" begin="0.3s"/>
    </circle>
    <circle cx="20" cy="80" r="1.2" fill="#81D4FA">
      <animate attributeName="opacity" values="0;1;0" dur="2.2s" repeatCount="indefinite" begin="0.6s"/>
    </circle>
    <circle cx="80" cy="75" r="1" fill="#AED581">
      <animate attributeName="opacity" values="0;1;0" dur="1.8s" repeatCount="indefinite" begin="0.9s"/>
    </circle>
    <path d="M 14 14 L 15 16 L 17 16 L 15 18 L 16 20 L 14 19 L 12 20 L 13 18 L 11 16 L 13 16 Z" fill="#FFE082">
      <animate attributeName="opacity" values="0;1;0" dur="2.8s" repeatCount="indefinite"/>
    </path>
    <path d="M 84 18 L 85 20 L 87 20 L 85 22 L 86 24 L 84 23 L 82 24 L 83 22 L 81 20 L 83 20 Z" fill="#FF80AB">
      <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" begin="0.4s"/>
    </path>
  </g>
  <!-- 身体 -->
  <ellipse cx="50" cy="62" rx="32" ry="26" fill="url(#ur-body)"/>
  <!-- 彩虹鬃（左右飘） -->
  <path class="ur-mane-l" d="M 22 44 Q 14 50 18 60 Q 12 66 20 72 Q 16 80 26 80" stroke="url(#ur-mane)" stroke-width="6" fill="none" stroke-linecap="round"/>
  <path class="ur-mane-r" d="M 78 44 Q 86 50 82 60 Q 88 66 80 72 Q 84 80 74 80" stroke="url(#ur-mane)" stroke-width="6" fill="none" stroke-linecap="round"/>
  <!-- 头 -->
  <ellipse cx="50" cy="48" rx="22" ry="22" fill="url(#ur-body)"/>
  <!-- 独角光柱 + 角 -->
  <g class="ur-beam">
    <path d="M 50 26 L 46 0 L 54 0 Z" fill="#FFEB3B" opacity="0.4"/>
  </g>
  <g class="ur-horn-glow">
    <path d="M 50 26 L 46 8 L 54 8 Z" fill="#FFD700" stroke="#FFA000" stroke-width="0.8"/>
    <path d="M 47 14 L 53 14" stroke="#FFA000" stroke-width="0.5"/>
    <path d="M 47 18 L 53 18" stroke="#FFA000" stroke-width="0.5"/>
    <path d="M 47 22 L 53 22" stroke="#FFA000" stroke-width="0.5"/>
  </g>
  <!-- 鬓（前） -->
  <path d="M 32 38 Q 26 36 22 32" stroke="url(#ur-mane)" stroke-width="3" fill="none" stroke-linecap="round"/>
  <path d="M 68 38 Q 74 36 78 32" stroke="url(#ur-mane)" stroke-width="3" fill="none" stroke-linecap="round"/>
  <!-- 大温柔眼（眨眼 + 紫光） -->
  <g style="filter: drop-shadow(0 0 2px #CE93D8)">
    <g class="ur-blink" style="transform-origin: 42px 48px">
      <ellipse cx="42" cy="48" rx="3.5" ry="5" fill="#7B68EE"/>
      <circle cx="43" cy="46" r="1.5" fill="#fff"/>
    </g>
    <g class="ur-blink" style="transform-origin: 58px 48px">
      <ellipse cx="58" cy="48" rx="3.5" ry="5" fill="#7B68EE"/>
      <circle cx="59" cy="46" r="1.5" fill="#fff"/>
    </g>
  </g>
  <!-- 鼻嘴 -->
  <ellipse cx="50" cy="56" rx="3" ry="2" fill="#FFB6C1"/>
  <path d="M 50 58 Q 46 62 44 60" stroke="#7B68EE" stroke-width="1.2" fill="none"/>
  <path d="M 50 58 Q 54 62 56 60" stroke="#7B68EE" stroke-width="1.2" fill="none"/>
  <!-- 腮红 -->
  <circle cx="34" cy="54" r="3" fill="#FFB6C1" opacity="0.7">
    <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="66" cy="54" r="3" fill="#FFB6C1" opacity="0.7">
    <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite"/>
  </circle>
</svg>`,
    weight: 100,
    isActive: true,
    description: '彩虹鬃毛，梦幻独角'
  },

  // 金翅狮鹫 — 狮身鹰翼（金光大翅扇 + 狮鬃飘 + 神光眼）
  {
    key: 'griffin_gold',
    name: '金翅狮鹫',
    tier: 'S',
    visualType: 'svg',
    svgContent: `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="gg-body" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#FFE082"/>
      <stop offset="100%" stop-color="#E8B339"/>
    </linearGradient>
    <linearGradient id="gg-wing" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFE082"/>
      <stop offset="100%" stop-color="#D4A017"/>
    </linearGradient>
    <radialGradient id="gg-aura" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FFEB3B" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#FF8F00" stop-opacity="0"/>
    </radialGradient>
    <style>
      .gg-wing-l { transform-origin: 38px 40px; animation: gg-wingl 1.5s ease-in-out infinite; }
      .gg-wing-r { transform-origin: 62px 40px; animation: gg-wingr 1.5s ease-in-out infinite; }
      .gg-mane1 { transform-origin: 32px 38px; animation: gg-mane 1.8s ease-in-out infinite; }
      .gg-mane2 { transform-origin: 40px 34px; animation: gg-mane 1.9s ease-in-out infinite 0.2s; }
      .gg-mane3 { transform-origin: 50px 30px; animation: gg-mane 2s ease-in-out infinite 0.4s; }
      .gg-mane4 { transform-origin: 60px 34px; animation: gg-mane 1.9s ease-in-out infinite 0.6s; }
      .gg-mane5 { transform-origin: 68px 38px; animation: gg-mane 1.8s ease-in-out infinite 0.8s; }
      .gg-blink { animation: gg-blink 5s ease-in-out infinite; }
      .gg-aura-anim { transform-origin: 50px 50px; animation: gg-aura 2.5s ease-in-out infinite; }
      .gg-feather1 { transform-origin: 20px 22px; animation: gg-feather 1.5s ease-in-out infinite; }
      .gg-feather2 { transform-origin: 80px 22px; animation: gg-feather 1.5s ease-in-out infinite 0.3s; }
      @keyframes gg-wingl { 0%,100% { transform: rotate(0deg) scaleY(1); } 50% { transform: rotate(-4deg) scaleY(0.94); } }
      @keyframes gg-wingr { 0%,100% { transform: rotate(0deg) scaleY(1); } 50% { transform: rotate(4deg) scaleY(0.94); } }
      @keyframes gg-mane { 0%,100% { transform: rotate(0deg); } 50% { transform: rotate(3deg); } }
      @keyframes gg-blink { 0%,94%,100% { transform: scaleY(1); } 96% { transform: scaleY(0.1); } }
      @keyframes gg-aura { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.1); } }
      @keyframes gg-feather { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
    </style>
  </defs>
  <!-- 神光光环 -->
  <circle class="gg-aura-anim" cx="50" cy="50" r="46" fill="url(#gg-aura)"/>
  <!-- 狮身 -->
  <ellipse cx="50" cy="62" rx="30" ry="26" fill="url(#gg-body)"/>
  <!-- 大翅（扇动） -->
  <g class="gg-wing-l">
    <path d="M 28 50 Q 8 22 6 8 Q 20 18 38 40 Z" fill="url(#gg-wing)" stroke="#B8860B" stroke-width="0.8"/>
    <path class="gg-feather1" d="M 14 18 Q 20 22 26 28" stroke="#B8860B" stroke-width="1" fill="none"/>
    <path d="M 16 26 Q 24 30 32 36" stroke="#B8860B" stroke-width="1" fill="none"/>
  </g>
  <g class="gg-wing-r">
    <path d="M 72 50 Q 92 22 94 8 Q 80 18 62 40 Z" fill="url(#gg-wing)" stroke="#B8860B" stroke-width="0.8"/>
    <path d="M 86 18 Q 80 22 74 28" stroke="#B8860B" stroke-width="1" fill="none"/>
    <path class="gg-feather2" d="M 84 26 Q 76 30 68 36" stroke="#B8860B" stroke-width="1" fill="none"/>
  </g>
  <!-- 鹰头 -->
  <ellipse cx="50" cy="44" rx="22" ry="20" fill="url(#gg-body)"/>
  <!-- 凶猛眼（金光脉冲 + 眨眼） -->
  <g style="filter: drop-shadow(0 0 3px #FFEB3B)">
    <g class="gg-blink" style="transform-origin: 42px 42px">
      <circle cx="42" cy="42" r="4.5" fill="#FFEB3B"/>
      <circle cx="42" cy="42" r="2.5" fill="#262626"/>
      <circle cx="42.5" cy="41.5" r="0.8" fill="#fff"/>
    </g>
    <g class="gg-blink" style="transform-origin: 58px 42px">
      <circle cx="58" cy="42" r="4.5" fill="#FFEB3B"/>
      <circle cx="58" cy="42" r="2.5" fill="#262626"/>
      <circle cx="58.5" cy="41.5" r="0.8" fill="#fff"/>
    </g>
  </g>
  <!-- 钩喙 -->
  <path d="M 44 50 L 56 50 L 50 62 Z" fill="#FF8F00"/>
  <path d="M 50 58 L 50 62" stroke="#C62828" stroke-width="1"/>
  <!-- 狮鬃（六飘） -->
  <path class="gg-mane1" d="M 30 38 Q 26 30 32 26" stroke="#D4A017" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path class="gg-mane2" d="M 36 34 Q 34 26 40 22" stroke="#D4A017" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path class="gg-mane3" d="M 44 32 Q 44 24 50 20" stroke="#D4A017" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path class="gg-mane4" d="M 56 32 Q 56 24 50 20" stroke="#D4A017" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path class="gg-mane5" d="M 64 34 Q 66 26 60 22" stroke="#D4A017" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path class="gg-mane1" d="M 70 38 Q 74 30 68 26" stroke="#D4A017" stroke-width="2" fill="none" stroke-linecap="round"/>
  <!-- 金色星尘 -->
  <circle cx="12" cy="44" r="1" fill="#FFEB3B">
    <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite"/>
  </circle>
  <circle cx="88" cy="50" r="1" fill="#FFEB3B">
    <animate attributeName="opacity" values="0;1;0" dur="2.4s" repeatCount="indefinite" begin="0.5s"/>
  </circle>
  <path d="M 6 60 L 7 62 L 9 62 L 7 64 L 8 66 L 6 65 L 4 66 L 5 64 L 3 62 L 5 62 Z" fill="#FFE082">
    <animate attributeName="opacity" values="0;1;0" dur="2.6s" repeatCount="indefinite"/>
  </path>
</svg>`,
    weight: 100,
    isActive: true,
    description: '狮身鹰翼，金光万丈'
  }
]

module.exports = SPECIES