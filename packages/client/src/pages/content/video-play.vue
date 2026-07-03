<!--
  科普视频播放页 (R-3802 + R-3803 play)
  - 顶部信息 (标题 + 简介 + 标签 + 时长 + 播放次数)
  - 中间 web-view 嵌视频 URL (mp4 / H5 embed 均可)
  - onShow 时 POST /videos/:id/play +1
-->
<template>
  <view class="video-play">
    <view v-if="loading && !video" class="video-play__loading">
      <text>召唤中…</text>
    </view>

    <view v-else-if="!video" class="video-play__empty">
      <text class="video-play__empty-emoji">🎬</text>
      <text class="video-play__empty-title">视频不存在或已下架</text>
    </view>

    <template v-else>
      <view
        class="video-play__hero"
        :style="{ background: emojiBg(video.meta?.coverEmoji) }"
      >
        <text class="video-play__hero-emoji">{{ video.meta?.coverEmoji || '🎬' }}</text>
      </view>

      <view class="video-play__body">
        <text class="video-play__title">{{ video.title }}</text>

        <view class="video-play__meta">
          <text v-if="video.category" class="video-play__cat">
            {{ categoryLabel(video.category) }}
          </text>
          <text v-if="video.durationSeconds" class="video-play__duration">
            ⏱ {{ formatDuration(video.durationSeconds) }}
          </text>
          <text class="video-play__views">
            ▶ {{ video.viewCount || 0 }} 次播放
          </text>
        </view>

        <view v-if="video.intro" class="video-play__intro">
          <text>{{ video.intro }}</text>
        </view>

        <view v-if="(video.tags || []).length" class="video-play__tags">
          <text
            v-for="t in video.tags"
            :key="t"
            class="video-play__tag"
          >
            #{{ t }}
          </text>
        </view>

        <view class="video-play__webview-box">
          <web-view
            v-if="video.videoUrl"
            :src="video.videoUrl"
            class="video-play__webview"
          />
          <view v-else class="video-play__nostub">
            <text>暂无视频地址</text>
          </view>
        </view>
      </view>
    </template>
  </view>
</template>

<script>
import { videoApi } from '@/api/video'

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

export default {
  data() {
    return {
      loading: true,
      video: null,
      played: false
    }
  },
  onLoad(query) {
    if (query && query.id) {
      this.id = query.id
      this.load()
    }
  },
  onShow() {
    if (this.video && this.video._id && !this.played) {
      this.bumpPlay()
    }
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await videoApi.detail(this.id)
        const data = res?.data || res || {}
        this.video = data
      } catch (e) {
        console.warn('[videoPlay.load]', e)
        this.video = null
      } finally {
        this.loading = false
      }
    },

    async bumpPlay() {
      try {
        const r = await videoApi.play(this.id)
        const data = r?.data || r || {}
        if (this.video && typeof data.viewCount === 'number') {
          this.video.viewCount = data.viewCount
        }
        this.played = true
      } catch (e) {
        this.played = true
      }
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
.video-play {
  min-height: 100vh;
  background: $bg-page;

  &__loading {
    padding: 240rpx $spacing-md;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: 240rpx $spacing-md;
    text-align: center;
  }
  &__empty-emoji {
    font-size: 96rpx;
    margin-bottom: $spacing-md;
  }
  &__empty-title {
    font-size: $font-lg;
    color: $text-secondary;
  }

  &__hero {
    height: 320rpx;
    @include flex-center;
  }
  &__hero-emoji {
    font-size: 160rpx;
    filter: drop-shadow(0 8rpx 16rpx rgba(0, 0, 0, 0.2));
  }

  &__body {
    padding: $spacing-md;
  }
  &__title {
    display: block;
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.4;
    margin-bottom: $spacing-sm;
  }
  &__meta {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
    align-items: center;
    font-size: $font-xs;
    color: $text-tertiary;
    margin-bottom: $spacing-md;
  }
  &__cat {
    padding: 4rpx 12rpx;
    background: $primary-lighter;
    color: $primary-dark;
    border-radius: $radius-pill;
  }
  &__intro {
    background: $bg-card;
    padding: $spacing-md;
    border-radius: $radius-md;
    color: $text-primary;
    font-size: $font-sm;
    line-height: 1.7;
    margin-bottom: $spacing-md;
    box-shadow: $shadow-card;
  }
  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4rpx;
    margin-bottom: $spacing-md;
  }
  &__tag {
    padding: 4rpx 12rpx;
    background: $bg-page;
    color: $text-secondary;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }

  &__webview-box {
    width: 100%;
    height: 480rpx;
    background: #000;
    border-radius: $radius-md;
    overflow: hidden;
  }
  &__webview {
    width: 100%;
    height: 100%;
  }
  &__nostub {
    @include flex-center;
    width: 100%;
    height: 100%;
    color: rgba(255, 255, 255, 0.5);
    font-size: $font-base;
  }
}
</style>
