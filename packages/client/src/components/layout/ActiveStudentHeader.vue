<!--
  ActiveStudentHeader - 当前活跃孩子头部条
  - 永远显示当前孩子 (CLAUDE.md §6)
  - 单孩子不显示下拉箭头,但保留元素
  - 多孩子时点击弹底部 ActionSheet
-->
<template>
  <view class="student-header">
    <view
      class="student-header__pill press-soft"
      :class="{ 'student-header__pill--clickable': student.hasMultiple }"
      @tap="onTap"
    >
      <view class="student-header__avatar">
        <image
          v-if="student.activeStudent && student.activeStudent.avatar"
          class="student-header__avatar-img"
          :src="student.activeStudent.avatar"
          mode="aspectFill"
        />
        <text v-else class="student-header__avatar-emoji">
          {{ avatarEmoji }}
        </text>
      </view>

      <view class="student-header__info">
        <text class="student-header__name">
          {{ student.activeStudent ? student.activeStudent.name : '未选择孩子' }}
        </text>
        <text v-if="student.hasMultiple" class="student-header__hint">
          点击切换 ▾
        </text>
        <text v-else-if="student.hasAny" class="student-header__hint">
          当前孩子
        </text>
        <text v-else class="student-header__hint">
          暂无孩子,请联系机构
        </text>
      </view>

      <view v-if="student.hasMultiple" class="student-header__arrow">
        <text class="student-header__arrow-icon">▾</text>
      </view>
    </view>

    <!-- 切换 ActionSheet -->
    <view v-if="showSwitcher" class="student-header__sheet" @tap="closeSwitcher">
      <view class="student-header__sheet-content anim-fade-in-up" @tap.stop>
        <view class="student-header__sheet-handle" />
        <text class="student-header__sheet-title">切换孩子</text>
        <view class="student-header__list">
          <view
            v-for="s in student.list"
            :key="s.id"
            class="student-header__item"
            :class="{
              'student-header__item--active': String(s.id) === String(student.activeStudentId)
            }"
            @tap="selectStudent(s)"
          >
            <view class="student-header__item-avatar">
              <image
                v-if="s.avatar"
                :src="s.avatar"
                class="student-header__item-img"
                mode="aspectFill"
              />
              <text v-else class="student-header__item-emoji">{{ emojiFor(s) }}</text>
            </view>
            <view class="student-header__item-info">
              <text class="student-header__item-name">{{ s.name }}</text>
              <text v-if="s.school || s.grade" class="student-header__item-meta">
                {{ s.school || '' }} {{ s.grade || '' }}
              </text>
            </view>
            <view
              v-if="String(s.id) === String(student.activeStudentId)"
              class="student-header__item-check"
            >
              <text class="student-header__item-check-icon">✓</text>
            </view>
          </view>
        </view>
        <view class="student-header__sheet-cancel press" @tap="closeSwitcher">
          <text>取消</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { useStudentStore } from '@/stores/student'
import { haptic } from '@/utils/haptic'

const AVATAR_EMOJI = ['🐰', '🐯', '🐻', '🦊', '🐼', '🐨', '🐸', '🐵', '🐱', '🐶']

export default {
  name: 'ActiveStudentHeader',
  data() {
    return {
      showSwitcher: false
    }
  },
  computed: {
    student() {
      return useStudentStore()
    },
    avatarEmoji() {
      const s = this.student.activeStudent
      if (!s) return '🐾'
      // 用 name 哈希选 emoji,保证稳定
      const idx = this._hash(s.name || '') % AVATAR_EMOJI.length
      return AVATAR_EMOJI[idx]
    }
  },
  methods: {
    _hash(str) {
      let h = 0
      for (let i = 0; i < str.length; i++) {
        h = (h << 5) - h + str.charCodeAt(i)
        h |= 0
      }
      return Math.abs(h)
    },
    emojiFor(s) {
      return AVATAR_EMOJI[this._hash(s.name || '') % AVATAR_EMOJI.length]
    },
    onTap() {
      if (this.student.hasMultiple) {
        haptic.tap()
        this.showSwitcher = true
      }
    },
    closeSwitcher() {
      this.showSwitcher = false
    },
    selectStudent(s) {
      this.student.setActive(s.id)
      haptic.success()
      this.closeSwitcher()
      this.$emit('change', s)
    }
  }
}
</script>

<style lang="scss" scoped>
.student-header {
  display: flex;

  &__pill {
    display: flex;
    align-items: center;
    padding: 8rpx 24rpx 8rpx 8rpx;
    background: rgba(255, 255, 255, 0.65);
    border-radius: $radius-pill;
    box-shadow: 0 4rpx 12rpx rgba(255, 138, 101, 0.12);
    backdrop-filter: blur(8rpx);

    &--clickable:active {
      background: rgba(255, 255, 255, 0.85);
    }
  }

  &__avatar {
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-light, $primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: 16rpx;
    box-shadow: 0 2rpx 8rpx rgba(255, 138, 101, 0.3);
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
  }

  &__avatar-emoji {
    font-size: 32rpx;
  }

  &__info {
    display: flex;
    flex-direction: column;
  }

  &__name {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.2;
  }

  &__hint {
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.2;
    margin-top: 2rpx;
  }

  &__arrow {
    margin-left: 12rpx;
  }

  &__arrow-icon {
    font-size: $font-sm;
    color: $text-secondary;
  }

  // 底部 ActionSheet
  &__sheet {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(45, 24, 16, 0.5);
    z-index: $z-modal;
    display: flex;
    align-items: flex-end;
    backdrop-filter: blur(4rpx);
  }

  &__sheet-content {
    width: 100%;
    background: $bg-card;
    border-radius: $radius-lg $radius-lg 0 0;
    padding: $spacing-md 0 $spacing-lg;
    padding-bottom: calc(#{$spacing-lg} + env(safe-area-inset-bottom, 0));
  }

  &__sheet-handle {
    width: 80rpx;
    height: 8rpx;
    border-radius: 4rpx;
    background: $divider;
    margin: 0 auto $spacing-md;
  }

  &__sheet-title {
    display: block;
    text-align: center;
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-md;
  }

  &__list {
    padding: 0 $spacing-md;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    border-radius: $radius-md;
    margin-bottom: $spacing-xs;
    transition: background $transition-fast;

    &--active {
      background: $primary-lighter;
    }

    &:active {
      background: $divider-light;
    }
  }

  &__item-avatar {
    width: 80rpx;
    height: 80rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-light, $primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: $spacing-sm;
  }

  &__item-img {
    width: 100%;
    height: 100%;
    border-radius: 50%;
  }

  &__item-emoji {
    font-size: 44rpx;
  }

  &__item-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  &__item-name {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.3;
  }

  &__item-meta {
    font-size: $font-xs;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__item-check {
    width: 40rpx;
    height: 40rpx;
    border-radius: 50%;
    background: $primary;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__item-check-icon {
    color: #fff;
    font-size: 24rpx;
    font-weight: bold;
  }

  &__sheet-cancel {
    margin: $spacing-md $spacing-md 0;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    text-align: center;
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
    box-shadow: $shadow-card;
  }
}
</style>