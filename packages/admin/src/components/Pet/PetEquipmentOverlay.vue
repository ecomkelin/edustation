<template>
  <!-- 2026-07-15 重构：装饰系统删除后，本组件退化为「宠物本体渲染」（视频/SVG/图片/emoji 兜底）。
       仍复用于课堂展示主图 / 详情弹窗预览。 -->
  <div class="pet-img" :class="{ 'is-dialog': mode === 'dialog' }">
    <div class="pet-frame">
      <video v-if="speciesRecord?.visualType === 'video' && speciesRecord.videoFile?.url"
             :src="speciesRecord.videoFile.url"
             autoplay loop muted playsinline
             class="video-render" />
      <img v-else-if="speciesRecord?.visualType === 'image' && speciesRecord.imageFile"
           :src="speciesRecord.imageFile.url" :alt="speciesRecord.name" />
      <div v-else-if="speciesRecord?.visualType === 'svg'" class="svg-wrap" v-html="speciesRecord.svgContent" />
      <div v-else class="emoji-fallback">{{ fallbackEmoji }}</div>
    </div>

    <div v-if="speciesRecord" class="species-name">{{ speciesRecord.name }}</div>
  </div>
</template>

<script>
/**
 * PetEquipmentOverlay — 宠物本体渲染（2026-07-15 去装饰后简化）
 *
 * props:
 *   - speciesRecord: 来自 pet.speciesRecord (populated，含 videoFile/svgContent/imageFile)
 *   - mode:          'classroom' (默认,大图) | 'dialog' (小预览)
 *   - fallbackEmoji: 没有 speciesRecord 时的兜底 emoji
 */
export default {
  name: 'PetEquipmentOverlay',
  props: {
    speciesRecord: { type: Object, default: null },
    mode: { type: String, default: 'classroom' },
    fallbackEmoji: { type: String, default: '🐾' }
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

/* 9:16 视频裁成正方形：父容器锁 1:1 + overflow hidden，视频高 177.78% 居中 */
.pet-frame {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  display: inline-block;
  border-radius: 8px;
}

.pet-frame > .video-render {
  position: absolute;
  top: 50%;
  left: 0;
  width: 100%;
  height: 177.78%;
  transform: translateY(-50%);
  object-fit: cover;
  display: block;
}
.pet-frame > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}
.pet-frame > .svg-wrap {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pet-frame > .svg-wrap :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
  transform: scale(1.2);
  transform-origin: center;
}
.pet-frame > .emoji-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 120px;
  line-height: 1;
}
.species-name {
  font-size: 16px;
  font-weight: bold;
  color: #ffd04b;
  margin-top: 8px;
}
</style>
