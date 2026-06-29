<!--
  切换孩子 - 全屏选择
-->
<template>
  <view class="switch-student">
    <view class="switch-student__bg">
      <view class="switch-student__circle switch-student__circle--1" />
      <view class="switch-student__circle switch-student__circle--2" />
    </view>

    <view class="switch-student__inner safe-area-top">
      <view class="switch-student__header">
        <text class="switch-student__title">选择孩子</text>
        <text class="switch-student__sub">每个孩子都有独立的课表、积分和宠物</text>
      </view>

      <view class="switch-student__list">
        <view
          v-for="s in student.list"
          :key="s.id"
          class="switch-student__item"
          :class="{
            'switch-student__item--active': String(s.id) === String(student.activeStudentId)
          }"
          @tap="select(s)"
        >
          <view class="switch-student__item-avatar">
            <image
              v-if="s.avatar"
              class="switch-student__item-img"
              :src="s.avatar"
              mode="aspectFill"
            />
            <text v-else class="switch-student__item-emoji">{{ emojiOf(s) }}</text>
          </view>
          <view class="switch-student__item-info">
            <text class="switch-student__item-name">{{ s.name }}</text>
            <text v-if="s.school || s.grade" class="switch-student__item-meta">
              {{ s.school || '' }} {{ s.grade ? '· ' + s.grade : '' }}
            </text>
            <text class="switch-student__item-gender">{{ genderOf(s) }} · {{ ageOf(s) }}</text>
          </view>
          <view
            v-if="String(s.id) === String(student.activeStudentId)"
            class="switch-student__item-check"
          >
            <text>✓</text>
          </view>
        </view>
      </view>

      <view class="switch-student__empty" v-if="!student.list.length">
        <text>暂无孩子数据,请联系机构</text>
      </view>

      <view class="switch-student__done press" @tap="onDone">
        <text>完成</text>
      </view>
    </view>
  </view>
</template>

<script>
import { useStudentStore } from '@/stores/student'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'

export default {
  data() {
    return {}
  },
  computed: {
    student() {
      return useStudentStore()
    }
  },
  onLoad() {
    if (!this.student.list.length) {
      this.student.fetchMyStudents().catch(() => null)
    }
  },
  methods: {
    select(s) {
      haptic.success()
      this.student.setActive(s.id)
    },
    onDone() {
      uni.navigateBack()
    },
    emojiOf(s) {
      const AVATARS = ['🐰', '🐯', '🐻', '🦊', '🐼', '🐨', '🐸', '🐵', '🐱', '🐶']
      let h = 0
      for (let i = 0; i < (s.name || '').length; i++) {
        h = (h << 5) - h + (s.name || '').charCodeAt(i)
        h |= 0
      }
      return AVATARS[Math.abs(h) % AVATARS.length]
    },
    genderOf(s) {
      return s.gender === 'male' ? '男' : s.gender === 'female' ? '女' : '保密'
    },
    ageOf(s) {
      return s.birthday ? date.age(s.birthday) + ' 岁' : ''
    }
  }
}
</script>

<style lang="scss" scoped>
.switch-student {
  min-height: 100vh;
  background: $bg-page;
  position: relative;
  overflow: hidden;

  &__bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  &__circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.4;
    animation: float 6s ease-in-out infinite;

    &--1 {
      width: 320rpx;
      height: 320rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: -80rpx;
      right: -100rpx;
    }
    &--2 {
      width: 240rpx;
      height: 240rpx;
      background: radial-gradient(circle, $accent-light 0%, transparent 70%);
      top: 100rpx;
      left: -80rpx;
      animation-delay: 1.5s;
    }
  }

  &__inner {
    position: relative;
    padding: $spacing-md;
    min-height: 100vh;
  }

  &__header {
    padding: $spacing-xl $spacing-md $spacing-lg;
    text-align: center;
  }

  &__title {
    display: block;
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__sub {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    border: 4rpx solid transparent;
    transition: all $transition-fast;

    &--active {
      border-color: $primary;
      box-shadow: $shadow-button;
    }

    &:active {
      transform: scale(0.98);
    }
  }

  &__item-avatar {
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-light, $primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: $spacing-md;
    overflow: hidden;
  }

  &__item-img {
    width: 100%;
    height: 100%;
  }

  &__item-emoji {
    font-size: 56rpx;
  }

  &__item-info {
    flex: 1;
  }

  &__item-name {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }

  &__item-meta {
    display: block;
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: 4rpx;
  }

  &__item-gender {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__item-check {
    width: 48rpx;
    height: 48rpx;
    border-radius: 50%;
    background: $primary;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28rpx;
    font-weight: bold;
  }

  &__empty {
    padding: $spacing-2xl;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  &__done {
    margin-top: $spacing-xl;
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    text-align: center;
    box-shadow: $shadow-button;

    & > text {
      color: #fff;
      font-size: $font-base;
      font-weight: $font-weight-semibold;
    }
  }
}
</style>