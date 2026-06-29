<!--
  PressFeedback - 按下回弹容器 (让任何 view 都有按下反馈)
-->
<template>
  <view
    class="press-feedback"
    :class="{ 'press-feedback--active': active, 'press-feedback--round': round }"
    @touchstart="onStart"
    @touchend="onEnd"
    @touchcancel="onEnd"
    @tap="$emit('click', $event)"
  >
    <slot />
  </view>
</template>

<script>
export default {
  name: 'PressFeedback',
  props: {
    scale: { type: Number, default: 0.96 },
    round: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false }
  },
  emits: ['click'],
  data() {
    return { active: false }
  },
  methods: {
    onStart() {
      if (this.disabled) return
      this.active = true
    },
    onEnd() {
      this.active = false
    }
  }
}
</script>

<style lang="scss" scoped>
.press-feedback {
  transition: transform $transition-fast, opacity $transition-fast;
  will-change: transform;

  &--active {
    transform: scale(0.96);
    opacity: 0.85;
  }

  &--round {
    border-radius: $radius-md;
  }
}
</style>