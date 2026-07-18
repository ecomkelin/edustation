'use strict'

/**
 * PetSpecies 种子数据 (2026-07-16 重写)
 *
 * 只保留 3 条基础物种：橘猫 / 小奶狗 / 蓝海豚。
 * 全部 visualType='svg' + svgContent 内联（前端裁 1:1 后展示）。
 * 16 条原物种 (兔/狐/熊猫/角鸮/狼/鹿/鸢/龙/朱雀/独角兽/狮鹫/...) 全部删除，
 * 后续按需手动添加。
 *
 * 字段顺序与 PetSpecies.model.js 对齐：
 *   key, name, visualType, svgContent, videoFile, weight, isActive, description
 *   2026-07-18: 删 maxLevel（最高等级由 levelVisuals[].max(level) 派生；空数组 → DEFAULT_SPECIES_MAX_LEVEL=1 兜底, 即"蛋态默认"只能 1 级）
 */
const SPECIES = [
  /* ───── 1. 橘猫 — 经典圆胖橘猫（眨眼 + 摇尾 + 呼吸） ───── */
  {
    key: 'cat_orange',
    name: '橘猫',
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
    <g class="co-tail">
      <path d="M 76 60 Q 92 56 90 72 Q 86 86 74 78" fill="url(#co-body)" stroke="#D4380D" stroke-width="0.8"/>
      <path d="M 84 70 Q 88 72 86 76" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/>
    </g>
    <ellipse cx="50" cy="62" rx="34" ry="28" fill="url(#co-body)"/>
    <path d="M 26 38 L 22 22 L 38 30 Z" fill="#FA8C16"/>
    <path d="M 74 38 L 78 22 L 62 30 Z" fill="#FA8C16"/>
    <path d="M 27 36 L 26 27 L 35 32 Z" fill="#FFADD2"/>
    <path d="M 73 36 L 74 27 L 65 32 Z" fill="#FFADD2"/>
    <circle cx="50" cy="48" r="26" fill="url(#co-body)"/>
    <path d="M 30 45 Q 35 42 40 45" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M 60 45 Q 65 42 70 45" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M 32 56 Q 38 53 44 56" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M 56 56 Q 62 53 68 56" stroke="#D4380D" stroke-width="2" fill="none" stroke-linecap="round"/>
    <g class="co-blink" style="transform-origin: 40px 50px">
      <ellipse cx="40" cy="50" rx="4" ry="5" fill="#262626"/>
      <circle cx="41" cy="48" r="1.5" fill="#fff"/>
    </g>
    <g class="co-blink" style="transform-origin: 60px 50px">
      <ellipse cx="60" cy="50" rx="4" ry="5" fill="#262626"/>
      <circle cx="61" cy="48" r="1.5" fill="#fff"/>
    </g>
    <path d="M 48 56 L 52 56 L 50 59 Z" fill="#FF6B6B"/>
    <path d="M 50 59 Q 46 62 44 60" stroke="#262626" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <path d="M 50 59 Q 54 62 56 60" stroke="#262626" stroke-width="1.5" fill="none" stroke-linecap="round"/>
    <circle cx="34" cy="56" r="3" fill="#FFADD2" opacity="0.6">
      <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2.5s" repeatCount="indefinite"/>
    </circle>
    <circle cx="66" cy="56" r="3" fill="#FFADD2" opacity="0.6">
      <animate attributeName="opacity" values="0.6;0.9;0.6" dur="2.5s" repeatCount="indefinite"/>
    </circle>
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

  /* ───── 2. 小奶狗 — 垂耳奶狗（垂耳摇 + 舌头伸缩 + 摇尾巴） ───── */
  {
    key: 'dog_puppy',
    name: '小奶狗',
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
    <g class="dp-tail">
      <path d="M 12 62 Q -2 58 4 72 Q 6 80 14 76" fill="url(#dp-body)" stroke="#A0692A" stroke-width="0.8"/>
    </g>
    <ellipse cx="50" cy="65" rx="32" ry="25" fill="url(#dp-body)"/>
    <circle cx="50" cy="46" r="26" fill="url(#dp-body)"/>
    <ellipse class="dp-ear-l" cx="26" cy="52" rx="8" ry="14" fill="#A0692A"/>
    <ellipse class="dp-ear-r" cx="74" cy="52" rx="8" ry="14" fill="#A0692A"/>
    <g class="dp-blink" style="transform-origin: 40px 48px">
      <ellipse cx="40" cy="48" rx="4.5" ry="5.5" fill="#262626"/>
      <circle cx="41" cy="46" r="1.8" fill="#fff"/>
    </g>
    <g class="dp-blink" style="transform-origin: 60px 48px">
      <ellipse cx="60" cy="48" rx="4.5" ry="5.5" fill="#262626"/>
      <circle cx="61" cy="46" r="1.8" fill="#fff"/>
    </g>
    <ellipse cx="50" cy="56" rx="3.5" ry="2.5" fill="#262626"/>
    <path d="M 50 58 Q 50 64 46 64" stroke="#262626" stroke-width="1.5" fill="none"/>
    <path d="M 50 58 Q 50 64 54 64" stroke="#262626" stroke-width="1.5" fill="none"/>
    <ellipse class="dp-tongue" cx="50" cy="64" rx="3" ry="2" fill="#FF6B6B"/>
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

  /* ───── 3. 蓝海豚 — 流线型（跃出水面 + 浪花 + 游动摇摆） ───── */
  {
    key: 'dolphin_blue',
    name: '蓝海豚',
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
  <line x1="0" y1="90" x2="100" y2="90" stroke="#1976D2" stroke-width="2" opacity="0.6"/>
  <g class="dl-swim">
    <path d="M 14 56 Q 24 30 50 30 Q 76 30 86 56 Q 76 76 50 76 Q 24 76 14 56 Z" fill="url(#dl-body)"/>
    <path d="M 22 64 Q 38 76 62 76 Q 76 72 82 64 Q 70 70 50 70 Q 30 70 22 64 Z" fill="#B3E5FC"/>
    <path d="M 78 56 Q 92 52 92 60 Q 92 64 80 62" fill="url(#dl-body)"/>
    <g class="dl-flipper">
      <path d="M 30 60 L 22 80 L 38 70 Z" fill="#1565C0"/>
    </g>
    <g class="dl-tail">
      <path d="M 14 56 L 4 44 L 14 52 Z" fill="#1565C0"/>
      <path d="M 14 56 L 4 68 L 14 60 Z" fill="#1565C0"/>
    </g>
    <g class="dl-blink" style="transform-origin: 68px 46px">
      <circle cx="68" cy="46" r="3.5" fill="#262626"/>
      <circle cx="69" cy="45" r="1.2" fill="#fff"/>
    </g>
    <path d="M 78 56 Q 84 60 88 56" stroke="#0D47A1" stroke-width="1.2" fill="none" stroke-linecap="round"/>
    <path d="M 62 56 L 62 64" stroke="#0D47A1" stroke-width="1"/>
    <path d="M 66 56 L 66 64" stroke="#0D47A1" stroke-width="1"/>
  </g>
</svg>`,
    weight: 100,
    isActive: true,
    description: '流线蓝海豚，跃出浪花'
  }
]

module.exports = SPECIES