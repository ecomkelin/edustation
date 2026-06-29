<!--
  Card - 通用卡片容器
-->
<template>
  <view
    class="card-wrapper"
    :class="[
      { 'card-wrapper--hover': hover, 'card-wrapper--press': press },
      paddingClass
    ]"
    :style="customStyle"
    @tap="onTap"
  >
    <slot />
  </view>
</template>

<script>
import { haptic } from '@/utils/haptic'
export default {
  name: 'Card',
  props: {
    padding: { type: String, default: 'md' }, // none | sm | md | lg
    hover: { type: Boolean, default: false }, // hover 状态加深阴影
    press: { type: Boolean, default: false }, // 按下回弹
    customStyle: { type: Object, default: () => ({}) }
  },
  emits: ['click'],
  computed: {
    paddingClass() {
      return `card-wrapper--p-${this.padding}`
    }
  },
  methods: {
    onTap(e) {
      if (this.press) haptic.tap()
      this.$emit('click', e)
    }
  }
}
</script>

<style lang="scss" scoped>
.card-wrapper {
  background: $bg-card;
  border-radius: $radius-md;
  box-shadow: $shadow-card;
  transition: all $transition-fast;
  position: relative;
  overflow: hidden;

  &--p-none {
    padding: 0;
  }
  &--p-sm {
    padding: $spacing-sm;
  }
  &--p-md {
    padding: $spacing-md;
  }
  &--p-lg {
    padding: $spacing-lg;
  }

  &--press:active {
    transform: scale(0.98);
    box-shadow: $shadow-card-hover;
  }

  &--hover:hover {
    box-shadow: $shadow-card-hover;
    transform: translateY(-2rpx);
  }
}
</style>