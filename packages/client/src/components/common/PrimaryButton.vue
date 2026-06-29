<!--
  PrimaryButton - 主按钮 (暖橙渐变 + 按下回弹 + loading)
-->
<template>
  <view
    class="primary-btn"
    :class="[
      'primary-btn--' + variant,
      { 'primary-btn--disabled': disabled || loading, 'primary-btn--block': block }
    ]"
    @tap="onTap"
  >
    <view v-if="loading" class="primary-btn__loading">
      <view class="primary-btn__spinner" />
    </view>
    <text v-else-if="icon" class="primary-btn__icon">{{ icon }}</text>
    <text class="primary-btn__text" :class="{ 'primary-btn__text--with-icon': icon || loading }">
      <slot>{{ text }}</slot>
    </text>
  </view>
</template>

<script>
import { haptic, preventRepeatClick } from '@/utils/share'
export default {
  name: 'PrimaryButton',
  props: {
    text: { type: String, default: '确定' },
    icon: { type: String, default: '' },
    variant: { type: String, default: 'primary' }, // primary | ghost | warn
    block: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    throttle: { type: Boolean, default: true }
  },
  emits: ['click'],
  methods: {
    async onTap() {
      if (this.disabled || this.loading) {
        if (!this.disabled) haptic.warn()
        return
      }
      haptic.tap()
      if (this.throttle) {
        const allow = await preventRepeatClick(500)
        if (!allow) return
      }
      this.$emit('click')
    }
  }
}
</script>

<style lang="scss" scoped>
.primary-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 22rpx 56rpx;
  border-radius: $radius-pill;
  font-size: $font-base;
  font-weight: $font-weight-semibold;
  transition: all 0.2s ease;
  position: relative;
  overflow: hidden;

  &--block {
    display: flex;
    width: 100%;
    padding: 26rpx 56rpx;
  }

  &--primary {
    background: linear-gradient(135deg, $primary 0%, $primary-light 100%);
    color: #fff;
    box-shadow: $shadow-button;

    &:active:not(&--disabled) {
      transform: scale(0.96);
      box-shadow: 0 4rpx 12rpx rgba(255, 138, 101, 0.18);
    }
  }

  &--ghost {
    background: #fff;
    color: $primary;
    border: 2rpx solid $primary;

    &:active:not(&--disabled) {
      background: $primary-bg;
    }
  }

  &--warn {
    background: $warning;
    color: #fff;
    box-shadow: 0 8rpx 24rpx rgba(255, 107, 107, 0.24);

    &:active:not(&--disabled) {
      transform: scale(0.96);
    }
  }

  &--disabled {
    opacity: 0.45;
    filter: grayscale(0.3);
    pointer-events: none;
  }

  &__icon {
    margin-right: 12rpx;
    font-size: $font-md;
  }

  &__text {
    color: inherit;
    font-size: inherit;
    font-weight: inherit;
    line-height: 1;
  }

  &__loading {
    margin-right: 12rpx;
    display: flex;
    align-items: center;
  }

  &__spinner {
    width: 28rpx;
    height: 28rpx;
    border: 4rpx solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
}
</style>