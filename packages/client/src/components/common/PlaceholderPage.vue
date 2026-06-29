<!--
  通用占位页 - Phase 1 未实装页面使用
-->
<template>
  <view class="placeholder">
    <view class="placeholder__art">
      <text class="placeholder__emoji">{{ emoji }}</text>
    </view>
    <text class="placeholder__title">{{ title }}</text>
    <text class="placeholder__desc">{{ desc }}</text>
    <view class="placeholder__phase">
      <text>预计 Phase {{ phase }} 实装</text>
    </view>
  </view>
</template>

<script>
export default {
  props: {
    emoji: { type: String, default: '🚧' },
    title: { type: String, default: '敬请期待' },
    desc: { type: String, default: '该功能正在精心打磨中' },
    phase: { type: [String, Number], default: '2' }
  }
}
</script>

<style lang="scss" scoped>
.placeholder {
  @include flex-center;
  flex-direction: column;
  padding: $spacing-2xl;
  min-height: 80vh;
  text-align: center;

  &__art {
    width: 240rpx;
    height: 240rpx;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-lg;
    box-shadow: 0 16rpx 40rpx rgba(255, 138, 101, 0.24);
    animation: float 3s ease-in-out infinite;
  }

  &__emoji {
    font-size: 120rpx;
  }

  &__title {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__desc {
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: $spacing-md;
    max-width: 480rpx;
  }

  &__phase {
    padding: 8rpx 20rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-xs;
    border-radius: $radius-pill;

    & > text {
      color: inherit;
    }
  }
}
</style>