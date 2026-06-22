<template>
  <!-- 2026-06-22: 装备叠加层 — 复用于课堂展示 / 详情弹窗
       关键修复:叠加层必须包在图片本体内部 (.pet-frame),不能相对外层 flex column
       否则 flex 列里的 species-name 会撑高容器,inset:0 拿到的不是图片区域 -->
  <div class="pet-img" :class="{ 'is-dialog': mode === 'dialog' }">
    <div class="pet-frame">
      <img v-if="speciesRecord?.visualType === 'image' && speciesRecord.imageFile"
           :src="speciesRecord.imageFile.url" :alt="speciesRecord.name" />
      <div v-else-if="speciesRecord?.visualType === 'svg'" class="svg-wrap" v-html="speciesRecord.svgContent" />
      <div v-else class="emoji-fallback">{{ fallbackEmoji }}</div>

      <!-- 叠加层：相对 .pet-frame（=图片实际渲染区域） -->
      <div class="equipment-overlay">
        <div
          v-for="ov in overlays"
          :key="ov.slot + ':' + ov.key"
          class="overlay-slot"
          :class="'slot-' + ov.slot"
          :title="`${slotLabels[ov.slot] || ov.slot}: ${ov.name}`"
        >
          <img v-if="ov.visualType === 'image' && ov.imageFile?.url"
               :src="ov.imageFile.url" :alt="ov.name" />
          <div v-else-if="ov.visualType === 'svg' && ov.svgContent" class="svg-wrap" v-html="ov.svgContent" />
        </div>
      </div>
    </div>

    <div v-if="speciesRecord" class="species-name">{{ speciesRecord.name }}</div>
  </div>
</template>

<script>
import { PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS } from '@/utils/constants'

/**
 * PetEquipmentOverlay — 宠物图 + 已装备叠加层
 *
 * props:
 *   - speciesRecord: 来自 pet.speciesRecord (populated)
 *   - equipped:     pet.equipped = { hat: 'hat_party_xxx', scarf: null, ... }
 *   - itemMap:      catalog key → { name, slot, visualType, svgContent, imageFile }
 *   - mode:         'classroom' (默认,大图模式) | 'dialog' (小预览模式)
 *   - fallbackEmoji: 没有 speciesRecord 时的兜底 emoji
 *
 * 计算 overlays:遍历 6 个 slot,若 equipped[slot] 在 itemMap 里有 visual 信息,推入数组。
 */
export default {
  name: 'PetEquipmentOverlay',
  props: {
    speciesRecord: { type: Object, default: null },
    equipped: { type: Object, default: () => ({}) },
    itemMap: { type: Object, default: () => ({}) },
    mode: { type: String, default: 'classroom' },
    fallbackEmoji: { type: String, default: '🐾' }
  },
  emits: [],
  data() {
    return { PET_ITEM_SLOTS, PET_ITEM_SLOT_LABELS }
  },
  computed: {
    overlays() {
      const out = []
      const equipped = this.equipped || {}
      for (const slot of PET_ITEM_SLOTS) {
        const key = equipped[slot]
        if (!key) continue
        const it = this.itemMap[key]
        if (!it) continue
        out.push({
          slot,
          key,
          name: it.name,
          visualType: it.visualType || 'image',
          svgContent: it.svgContent || null,
          imageFile: it.imageFile || null
        })
      }
      return out
    },
    slotLabels() {
      return PET_ITEM_SLOT_LABELS
    }
  }
}
</script>

<style scoped>
.pet-img {
  width: 100%;
  max-width: 80%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.pet-img.is-dialog {
  max-width: 240px;
}

/* 2026-06-22: 新增 .pet-frame — 包裹图片本体,作为叠加层定位基准
   关键:frame 必须有明确 width,等于图片渲染宽度;高度由图片自然 aspect-ratio 决定 */
.pet-frame {
  position: relative;
  width: 100%;
  display: inline-block;
}

.pet-frame > img,
.pet-frame > .svg-wrap,
.pet-frame > .emoji-fallback {
  width: 100%;
  max-height: 60vh;
  object-fit: contain;
  display: block;
}
.pet-frame > .svg-wrap :deep(svg) {
  width: 100%;
  max-height: 60vh;
  display: block;
}
.pet-frame > .emoji-fallback {
  font-size: 280px;
  line-height: 1;
  text-align: center;
}

.equipment-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 2;
}
.overlay-slot {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}
.overlay-slot img,
.overlay-slot .svg-wrap :deep(svg) {
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.25));
}
.species-name {
  font-size: 16px;
  font-weight: bold;
  color: #ffd04b;
  margin-top: 8px;
}

/* ─── 6 slot 固定坐标(以 .pet-frame 为 100% × 100% 框,即图片实际渲染区域)
     2026-06-22 第 2 次调优 — 统计 16 个物种实际坐标后:
       - 躯干: y 30~40% (顶) ~ 88~95% (底) — 极稳定
       - 头:   y 22~74% (中等物种) / y 4~96% (金丝熊/独角兽等大头)
       - 脖子 = 头与躯干交界(躯干顶部,约 40~55%)
     关键:clothes 必须放躯干下半,不能让衣服遮到脸部!
       修法: clothes 限定在 y 50~88%,不碰脸上半
       scarf 放在脖子 (y 45~58%),并确保 z-index > clothes 让围巾不被压
       hat   放头顶(小奶狗/熊猫)或耳尖(兔子) — 折中 y 8~30%
       accessory (眼镜)放脸正中 y 38~52% */
.slot-background {
  top: 0; left: 0; width: 100%; height: 100%;
  opacity: 0.35;
  z-index: 0;
}
.slot-halo      { top: -2%; left: 50%; transform: translateX(-50%); width: 70%; height: 22%; opacity: 0.85; z-index: 2; }
.slot-hat       { top: 8%;  left: 50%; transform: translateX(-50%); width: 55%; height: 28%; z-index: 3; }
.slot-accessory { top: 36%; left: 50%; transform: translateX(-50%); width: 50%; height: 18%; z-index: 4; }
.slot-scarf     { top: 50%; left: 50%; transform: translateX(-50%); width: 55%; height: 14%; z-index: 4; }
.slot-clothes   { top: 55%; left: 50%; transform: translateX(-50%); width: 70%; height: 35%; z-index: 2; }
</style>