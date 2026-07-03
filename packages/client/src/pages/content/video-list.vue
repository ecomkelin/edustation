<!--
  科普视频列表 (R-3801)
  - 加载更多式分页 (每页 12 个)
  - 顶部 banner
  - 单列卡片 (含封面 emoji + 标题 + 时长 + 简介 + 标签 + ▶ 按钮)
  - 点卡片 / 按钮走 web-view 播放
-->
<template>
  <view class="video-list">
    <view class="video-list__hero">
      <text class="video-list__hero-title">🎬 趣味科普视频</text>
      <text class="video-list__hero-sub">让孩子爱上科学 · 一段视频就是一段旅程</text>
    </view>

    <view v-if="loading && !videos.length" class="video-list__loading">
      <text>召唤中…</text>
    </view>

    <view v-else-if="!videos.length" class="video-list__empty">
      <text class="video-list__empty-emoji">🎬</text>
      <text class="video-list__empty-title">视频在路上</text>
      <text class="video-list__empty-desc">平台会持续更新, 敬请期待 ›</text>
    </view>

    <view v-else class="video-list__body">
      <view
        v-for="v in videos"
        :key="v._id"
        class="video-list__card press"
        @tap="goPlay(v)"
      >
        <view
          class="video-list__cover"
          :style="{ background: emojiBg(v.meta?.coverEmoji) }"
        >
          <text class="video-list__cover-emoji">{{ v.meta?.coverEmoji || '🎬' }}</text>
          <view class="video-list__play">
            <text>▶</text>
          </view>
          <view v-if="v.durationSeconds" class="video-list__duration">
            <text>{{ formatDuration(v.durationSeconds) }}</text>
          </view>
        </view>
        <view class="video-list__info">
          <text class="video-list__title">{{ v.title }}</text>
          <text v-if="v.intro" class="video-list__intro">{{ v.intro }}</text>
          <view v-if="(v.tags || []).length" class="video-list__tags">
            <text
              v-for="t in v.tags.slice(0, 3)"
              :key="t"
              class="video-list__tag"
            >
              {{ t }}
            </text>
          </view>
          <view class="video-list__meta">
            <text v-if="v.category" class="video-list__cat">{{ categoryLabel(v.category) }}</text>
            <text class="video-list__views">▶ {{ v.viewCount || 0 }} 次播放</text>
          </view>
        </view>
      </view>

      <!-- 加载更多 / 结束态 -->
      <view v-if="hasMore" class="video-list__more">
        <el-button
          v-if="!loadingMore"
          type="primary"
          plain
          size="small"
          @click="loadMore"
        >
          加载更多
        </el-button>
        <text v-else class="video-list__more-tip">加载中…</text>
      </view>
      <view v-else-if="videos.length" class="video-list__end">
        <text>— 已经到底了 —</text>
      </view>
    </view>
  </view>
</template>

<script>
import { videoApi } from '@/api/video'
import { haptic } from '@/utils/haptic'

const CATEGORY_LABELS = {
  science: '科学',
  nature: '自然',
  space: '宇宙',
  history: '历史',
  art: '艺术'
}

const EMOJI_BG = {
  '🪐': 'linear-gradient(135deg, #5B9EE6, #4F46E5)',
  '🌌': 'linear-gradient(135deg, #1E40AF, #5B9EE6)',
  '🌊': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)',
  '🦕': 'linear-gradient(135deg, #7CD9B7, #F5C148)',
  '🌋': 'linear-gradient(135deg, #FF8A65, #F5C148)',
  '🔬': 'linear-gradient(135deg, #B197FC, #5B9EE6)',
  '🧬': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)',
  '🌍': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)',
  '🚀': 'linear-gradient(135deg, #FF8A65, #B197FC)',
  '🐙': 'linear-gradient(135deg, #B197FC, #4F46E5)'
}

const PAGE_SIZE = 12

export default {
  data() {
    return {
      videos: [],
      loading: false,
      loadingMore: false,
      page: 1,
      hasMore: true,
      total: 0
    }
  },
  onShow() {
    this.refresh()
  },
  onPullDownRefresh() {
    this.refresh().finally(() => uni.stopPullDownRefresh())
  },
  methods: {
    async refresh() {
      this.loading = true
      this.page = 1
      this.hasMore = true
      try {
        await this.fetchPage(1, true)
      } finally {
        this.loading = false
      }
    },

    async loadMore() {
      if (this.loadingMore || !this.hasMore) return
      this.loadingMore = true
      try {
        await this.fetchPage(this.page + 1, false)
      } finally {
        this.loadingMore = false
      }
    },

    async fetchPage(p, replace) {
      try {
        const res = await videoApi.list({ page: p, pageSize: PAGE_SIZE })
        const data = res?.data || res || {}
        const items = Array.isArray(data.items) ? data.items
          : Array.isArray(data.data) ? data.data
          : Array.isArray(data) ? data
          : []
        // 后端返 items[] + total + page + pageSize
        this.total = typeof data.total === 'number' ? data.total : items.length
        if (replace) {
          this.videos = items
        } else {
          this.videos = this.videos.concat(items)
        }
        this.page = (typeof data.page === 'number' ? data.page : p)
        this.hasMore = this.videos.length < this.total
      } catch (e) {
        console.warn('[videoList.fetchPage]', e)
        if (replace) this.videos = []
        this.hasMore = false
      }
    },

    goPlay(v) {
      if (!v || !v._id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/content/video-play?id=${v._id}` })
    },

    formatDuration(s) {
      if (!s || s <= 0) return ''
      const m = Math.floor(s / 60)
      const sec = s % 60
      return `${m}:${String(sec).padStart(2, '0')}`
    },

    categoryLabel(key) {
      return CATEGORY_LABELS[key] || key
    },

    emojiBg(e) {
      return EMOJI_BG[e] || 'linear-gradient(135deg, #FFB088, #FF8A65)'
    }
  }
}
</script>

<style lang="scss" scoped>
.video-list {
  min-height: 100vh;
  background: $bg-page;
  padding: $spacing-md $spacing-lg;

  &__hero {
    background: linear-gradient(135deg, #5B9EE6 0%, #4F46E5 100%);
    border-radius: $radius-md;
    padding: $spacing-md $spacing-lg;
    margin-bottom: $spacing-md;
    color: #fff;
    box-shadow: 0 8rpx 24rpx rgba(79, 70, 229, 0.3);
  }
  &__hero-title {
    display: block;
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    margin-bottom: $spacing-xs;
  }
  &__hero-sub {
    display: block;
    font-size: $font-sm;
    opacity: 0.85;
  }

  &__loading {
    padding: $spacing-xl;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-xl $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__empty-emoji {
    font-size: 80rpx;
    margin-bottom: $spacing-sm;
  }
  &__empty-title {
    font-size: $font-base;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__empty-desc {
    font-size: $font-sm;
    color: $text-tertiary;
  }

  &__body {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }

  &__card {
    background: $bg-card;
    border-radius: $radius-md;
    overflow: hidden;
    box-shadow: $shadow-card;
  }
  &__cover {
    width: 100%;
    height: 360rpx;
    @include flex-center;
    position: relative;
  }
  &__cover-emoji {
    font-size: 144rpx;
    filter: drop-shadow(0 6rpx 14rpx rgba(0, 0, 0, 0.25));
  }
  &__play {
    position: absolute;
    width: 96rpx;
    height: 96rpx;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 50%;
    @include flex-center;
    border: 4rpx solid rgba(255, 255, 255, 0.6);

    & > text {
      color: #fff;
      font-size: 40rpx;
      margin-left: 8rpx;
    }
  }
  &__duration {
    position: absolute;
    bottom: $spacing-sm;
    right: $spacing-sm;
    padding: 4rpx 12rpx;
    background: rgba(0, 0, 0, 0.55);
    border-radius: $radius-pill;

    & > text {
      color: #fff;
      font-size: $font-xs;
    }
  }

  &__info {
    padding: $spacing-md;
  }
  &__title {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
    @include multi-ellipsis(2);
  }
  &__intro {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.5;
    margin-bottom: $spacing-sm;
    @include multi-ellipsis(2);
  }
  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4rpx;
    margin-bottom: $spacing-xs;
  }
  &__tag {
    padding: 2rpx 10rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }
  &__meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  &__cat {
    padding: 4rpx 12rpx;
    background: $bg-page;
    color: $text-secondary;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }
  &__views {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__more {
    text-align: center;
    padding: $spacing-md 0;
  }
  &__more-tip {
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__end {
    text-align: center;
    padding: $spacing-md 0 $spacing-xl;
    color: $text-tertiary;
    font-size: $font-xs;
  }
}
</style>
