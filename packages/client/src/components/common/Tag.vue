<!--
  Tag - 标签 chip (8 种 variant)
-->
<template>
  <view class="tag-chip" :class="['tag-chip--' + variant, { 'tag-chip--solid': solid }]">
    <text v-if="icon" class="tag-chip__icon">{{ icon }}</text>
    <text class="tag-chip__text"><slot>{{ text }}</slot></text>
  </view>
</template>

<script>
export default {
  name: 'Tag',
  props: {
    text: { type: String, default: '' },
    icon: { type: String, default: '' },
    variant: { type: String, default: 'default' },
    // default | primary | warn | success | info | gold | purple | ghost
    solid: { type: Boolean, default: false }
  }
}
</script>

<style lang="scss" scoped>
.tag-chip {
  @include tag-base;

  &--default {
    background: $primary-lighter;
    color: $primary-dark;
  }

  &--primary {
    background: $primary-lighter;
    color: $primary-dark;
  }

  &--warn {
    background: $warning-light;
    color: $warning;
  }

  &--success {
    background: $accent-light;
    color: darken($accent, 20%);
  }

  &--info {
    background: #E5F0FA;
    color: $info;
  }

  &--gold {
    background: #FFF1D0;
    color: darken($gold, 15%);
  }

  &--purple {
    background: #EDE3FA;
    color: $purple;
  }

  &--ghost {
    background: $divider-light;
    color: $text-secondary;
  }

  &--solid {
    &.tag-chip--primary {
      background: $primary;
      color: #fff;
    }
    &.tag-chip--warn {
      background: $warning;
      color: #fff;
    }
    &.tag-chip--success {
      background: $accent;
      color: #fff;
    }
    &.tag-chip--gold {
      background: $gold;
      color: #fff;
    }
  }

  &__icon {
    margin-right: 6rpx;
    font-size: $font-xs;
  }

  &__text {
    color: inherit;
    font-size: inherit;
    line-height: 1.4;
  }
}
</style>