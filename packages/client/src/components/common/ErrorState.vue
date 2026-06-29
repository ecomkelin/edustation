<!--
  ErrorState - 错误兜底
-->
<template>
  <view class="error-state">
    <view class="error-state__icon">
      <text class="error-state__emoji">{{ emoji }}</text>
    </view>
    <text class="error-state__title">{{ title }}</text>
    <text v-if="desc" class="error-state__desc">{{ desc }}</text>
    <view v-if="showRetry" class="error-state__action">
      <view class="error-state__retry press" @tap="$emit('retry')">
        <text class="error-state__retry-text">{{ retryText }}</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  name: 'ErrorState',
  props: {
    title: { type: String, default: '出了点小问题' },
    desc: { type: String, default: '请稍后再试,或者点重试' },
    emoji: { type: String, default: '😿' },
    showRetry: { type: Boolean, default: true },
    retryText: { type: String, default: '再试一次' }
  },
  emits: ['retry']
}
</script>

<style lang="scss" scoped>
.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $spacing-2xl $spacing-lg;
  text-align: center;
  animation: shake 0.4s ease-out;

  &__icon {
    width: 160rpx;
    height: 160rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, #FFE4D3, #FFD0B8);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-md;
    box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.18);
  }

  &__emoji {
    font-size: 80rpx;
    line-height: 1;
  }

  &__title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__desc {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.6;
    max-width: 480rpx;
    margin-bottom: $spacing-md;
  }

  &__retry {
    padding: 16rpx 48rpx;
    background: $primary;
    color: #fff;
    border-radius: $radius-pill;
    font-size: $font-sm;
    font-weight: $font-weight-medium;
    box-shadow: $shadow-button;
  }

  &__retry-text {
    color: #fff;
    font-size: $font-sm;
  }
}
</style>