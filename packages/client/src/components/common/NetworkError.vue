<!--
  NetworkError - 网络断线专用
-->
<template>
  <view class="network-error">
    <text class="network-error__emoji">📡</text>
    <text class="network-error__title">信号好像去捉迷藏了</text>
    <text class="network-error__desc">请检查网络连接,然后再试一次</text>
    <view class="network-error__retry press" @tap="$emit('retry')">
      <text class="network-error__retry-text">重新连接</text>
    </view>
  </view>
</template>

<script>
export default {
  name: 'NetworkError',
  emits: ['retry']
}
</script>

<style lang="scss" scoped>
.network-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: $spacing-2xl $spacing-lg;

  &__emoji {
    font-size: 120rpx;
    margin-bottom: $spacing-md;
    animation: float 2s ease-in-out infinite;
  }

  &__title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__desc {
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: $spacing-md;
  }

  &__retry {
    padding: 18rpx 56rpx;
    background: $primary;
    color: #fff;
    border-radius: $radius-pill;
    box-shadow: $shadow-button;
  }

  &__retry-text {
    color: #fff;
    font-size: $font-sm;
    font-weight: $font-weight-medium;
  }
}
</style>