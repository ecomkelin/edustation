<!--
  EmptyState - 友好空状态组件
  - 不用冷冰冰的"暂无数据",而是情感化文案 + SVG 插画
  - 支持自定义 action 按钮
-->
<template>
  <view class="empty-state" :class="{ 'empty-state--inline': inline }">
    <!-- SVG 插画 -->
    <view class="empty-state__art">
      <slot name="art">
        <view class="empty-state__default-art">
          <view class="empty-state__pet" :style="{ background: bgColor }">
            <text class="empty-state__emoji">{{ emoji }}</text>
          </view>
          <view class="empty-state__shadow" />
        </view>
      </slot>
    </view>

    <view class="empty-state__body">
      <text class="empty-state__title">{{ title }}</text>
      <text v-if="desc" class="empty-state__desc">{{ desc }}</text>
    </view>

    <view v-if="$slots.action" class="empty-state__action">
      <slot name="action" />
    </view>
  </view>
</template>

<script>
export default {
  name: 'EmptyState',
  props: {
    title: { type: String, default: '空空如也' },
    desc: { type: String, default: '' },
    emoji: { type: String, default: '🐾' },
    bgColor: { type: String, default: '#FFE4D3' },
    inline: { type: Boolean, default: false }
  }
}
</script>

<style lang="scss" scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: $spacing-2xl $spacing-lg;
  text-align: center;
  animation: fadeIn 0.4s ease-out;

  &--inline {
    padding: $spacing-lg $spacing-md;
  }

  &__art {
    margin-bottom: $spacing-md;
  }

  &__default-art {
    position: relative;
    width: 200rpx;
    height: 200rpx;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__pet {
    width: 160rpx;
    height: 160rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    animation: float 3s ease-in-out infinite;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.2);
  }

  &__emoji {
    font-size: 96rpx;
    line-height: 1;
  }

  &__shadow {
    position: absolute;
    bottom: 8rpx;
    width: 120rpx;
    height: 16rpx;
    border-radius: 50%;
    background: rgba(255, 138, 101, 0.15);
    filter: blur(4rpx);
  }

  &__body {
    margin-bottom: $spacing-md;
  }

  &__title {
    display: block;
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
  }

  &__action {
    margin-top: $spacing-md;
  }
}
</style>