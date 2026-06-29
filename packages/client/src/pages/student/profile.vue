<!--
  学习画像 - 孩子的学习数据可视化
-->
<template>
  <view class="profile">
    <view v-if="loading" class="profile__loading">
      <view class="profile__loading-circle" />
      <text>画像加载中...</text>
    </view>

    <view v-else-if="!data" class="profile__empty">
      <view class="profile__empty-art">
        <text>📊</text>
      </view>
      <text class="profile__empty-title">还没有画像数据</text>
      <text class="profile__empty-desc">孩子上课后,这里会展示学习数据</text>
    </view>

    <scroll-view v-else scroll-y class="profile__body">
      <view class="profile__hero">
        <view class="profile__hero-bg profile__hero-bg--1" />
        <view class="profile__hero-bg profile__hero-bg--2" />
        <view class="profile__avatar">
          <image v-if="data.avatar" class="profile__avatar-img" :src="data.avatar" mode="aspectFill" />
          <text v-else class="profile__avatar-emoji">👦</text>
        </view>
        <text class="profile__name">{{ data.name || '孩子' }}</text>
        <text v-if="data.subtitle" class="profile__sub">{{ data.subtitle }}</text>
      </view>

      <view class="profile__stats">
        <view class="profile__stat">
          <text class="profile__stat-val">{{ data.totalLessons || 0 }}</text>
          <text class="profile__stat-lbl">累计课时</text>
        </view>
        <view class="profile__stat">
          <text class="profile__stat-val">{{ data.attendanceRate || 0 }}%</text>
          <text class="profile__stat-lbl">出勤率</text>
        </view>
        <view class="profile__stat">
          <text class="profile__stat-val">{{ data.workCount || 0 }}</text>
          <text class="profile__stat-lbl">作品数</text>
        </view>
      </view>

      <view class="profile__section">
        <text class="profile__section-title">📚 在读课程</text>
        <view v-if="!data.enrollments || !data.enrollments.length" class="profile__sub-empty">
          <text>暂无在读课程</text>
        </view>
        <view v-else class="profile__sub-list">
          <view v-for="(e, i) in data.enrollments" :key="i" class="profile__sub-item">
            <text class="profile__sub-name">{{ e.name || e.courseInstance?.name }}</text>
            <text class="profile__sub-meta">{{ e.teacher || '老师待定' }}</text>
          </view>
        </view>
      </view>

      <view class="profile__section">
        <text class="profile__section-title">⭐ 老师评语</text>
        <view v-if="!data.evaluations || !data.evaluations.length" class="profile__sub-empty">
          <text>暂无评语</text>
        </view>
        <view v-else class="profile__sub-list">
          <view v-for="(e, i) in data.evaluations" :key="i" class="profile__eval-item">
            <text class="profile__eval-text">{{ e.text || e.content }}</text>
            <text class="profile__eval-date">{{ formatDate(e.date || e.createdAt) }}</text>
          </view>
        </view>
      </view>

      <view class="profile__section">
        <text class="profile__section-title">🎯 兴趣标签</text>
        <view v-if="!data.tags || !data.tags.length" class="profile__sub-empty">
          <text>暂无标签</text>
        </view>
        <view v-else class="profile__tags">
          <view v-for="(t, i) in data.tags" :key="i" class="tag tag-success">
            <text>{{ t }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { studentApi } from '@/api/student'
import { useStudentStore } from '@/stores/student'
import { date } from '@/utils/date'

export default {
  data() {
    return {
      loading: true,
      data: null
    }
  },
  computed: {
    studentId() {
      return useStudentStore().activeStudentId
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await studentApi.profile(this.studentId)
        this.data = res || {}
      } catch (e) {
        this.data = null
      } finally {
        this.loading = false
      }
    },
    formatDate: (d) => (d ? date.fmtDate(d) : '')
  }
}
</script>

<style lang="scss" scoped>
.profile {
  min-height: 100vh;
  background: $bg-page;

  &__loading {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    color: $text-secondary;
  }

  &__loading-circle {
    width: 80rpx;
    height: 80rpx;
    border: 6rpx solid $divider;
    border-top-color: $primary;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: $spacing-md;
  }

  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    text-align: center;
  }

  &__empty-art {
    width: 200rpx;
    height: 200rpx;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 96rpx;
    margin-bottom: $spacing-lg;
  }

  &__empty-title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__empty-desc {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__body {
    height: 100vh;
  }

  &__hero {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl $spacing-md $spacing-xl;
    background: linear-gradient(180deg, #FFB088 0%, $bg-page 100%);
    position: relative;
    overflow: hidden;
  }

  &__hero-bg {
    position: absolute;
    border-radius: 50%;
    opacity: 0.4;
    animation: float 6s ease-in-out infinite;
    pointer-events: none;

    &--1 {
      width: 240rpx;
      height: 240rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: -60rpx;
      right: -40rpx;
    }
    &--2 {
      width: 180rpx;
      height: 180rpx;
      background: radial-gradient(circle, $accent-light 0%, transparent 70%);
      top: 60rpx;
      left: -40rpx;
      animation-delay: 1.5s;
    }
  }

  &__avatar {
    width: 160rpx;
    height: 160rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-light, $primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-md;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.32);
    overflow: hidden;
    z-index: 1;
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
  }

  &__avatar-emoji {
    font-size: 80rpx;
  }

  &__name {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    z-index: 1;
  }

  &__sub {
    font-size: $font-sm;
    color: $text-secondary;
    margin-top: $spacing-xs;
    z-index: 1;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md $spacing-sm;
    box-shadow: $shadow-card;
    margin: $spacing-md;
  }

  &__stat {
    @include flex-center;
    flex-direction: column;
  }

  &__stat-val {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $primary;
  }

  &__stat-lbl {
    font-size: $font-xs;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__section {
    padding: $spacing-md;
  }

  &__section-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  &__sub-empty {
    padding: $spacing-md;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
    background: $bg-card;
    border-radius: $radius-sm;
  }

  &__sub-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__sub-item {
    padding: $spacing-sm $spacing-md;
    background: $bg-card;
    border-radius: $radius-sm;
    box-shadow: $shadow-card;
  }

  &__sub-name {
    display: block;
    font-size: $font-base;
    color: $text-primary;
    font-weight: $font-weight-medium;
  }

  &__sub-meta {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__eval-item {
    padding: $spacing-md;
    background: $primary-lighter;
    border-radius: $radius-sm;
    margin-bottom: $spacing-xs;
  }

  &__eval-text {
    display: block;
    font-size: $font-sm;
    color: $text-primary;
    line-height: 1.6;
    margin-bottom: $spacing-xs;
  }

  &__eval-date {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }
}
</style>