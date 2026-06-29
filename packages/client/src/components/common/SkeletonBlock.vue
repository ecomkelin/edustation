<!--
  SkeletonBlock - 骨架屏 (脉冲渐变)
-->
<template>
  <view class="skeleton" :class="['skeleton--' + shape]" :style="customStyle" />
</template>

<script>
export default {
  name: 'SkeletonBlock',
  props: {
    width: { type: String, default: '100%' },
    height: { type: String, default: '32rpx' },
    shape: { type: String, default: 'rect' }, // rect | circle | rounded
    rounded: { type: String, default: '16rpx' }
  },
  computed: {
    customStyle() {
      return {
        width: this.width,
        height: this.height,
        borderRadius: this.shape === 'circle' ? '50%' : this.rounded
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.skeleton {
  background: linear-gradient(
    90deg,
    rgba(255, 224, 200, 0.3) 0%,
    rgba(255, 200, 170, 0.5) 50%,
    rgba(255, 224, 200, 0.3) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  display: block;
}
</style>