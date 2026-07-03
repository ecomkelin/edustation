<!--
  科普视频播放页 (R-3802 + R-3803 play)
  - 2026-07-03 用户反馈: "点击直接进入观看模式" — 重构为 play-first 布局
  - 顶部: 极简 header (back + 标题左右结构), 不占视野
  - 中部: 大尺寸 web-view 播放器 (60vh+) — 打开即看到视频在播
  - 底部: 紧凑 info card (intro + tags + meta)
  - onShow 自动 bumpViewCount
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
      <!-- 极简 header (back + 时长) -->
      <view class="video-play__bar">
        <view class="video-play__back" @tap="goBack">
          <text>‹</text>
        </view>
        <view class="video-play__bar-meta">
          <text v-if="video.durationSeconds" class="video-play__duration">
            ⏱ {{ formatDuration(video.durationSeconds) }}
          </text>
          <text class="video-play__views">
            ▶ {{ video.viewCount || 0 }} 次
          </text>
        </view>
      </view>

      <!-- 大尺寸播放器 (60vh, 用户点开即看到播放区) -->
      <view class="video-play__player">
        <!-- 2026-07-03 用户反馈: 不应点击 ▶ / 不应静音 / 默认有声音
             策略: 不写 muted 属性, 直接尝试 unmuted autoplay.
             Chrome 在 navigateTo 的 user activation context 内会放行; Firefox 同;
             iOS Safari 严格点可能拒绝 — 此时视频停在 0:00, 用户点原生 controls ▶ 触发 real user gesture, 浏览器 100% 放行有声音 (不需要提示条).

             :muted="false" 显式绑定避免 Vue 把 boolean prop 报 "readonly" warning -->
        <video
          v-if="video.videoUrl && isMp4"
          ref="videoEl"
          :src="video.videoUrl"
          autoplay
          :muted="false"
          controls
          playsinline
          preload="auto"
          class="video-play__video"
          @play="onVideoPlay"
        />
        <web-view
          v-else-if="video.videoUrl"
          :src="video.videoUrl"
          class="video-play__webview"
        />
        <view v-else class="video-play__nostub">
          <text>暂无视频地址</text>
        </view>
      </view>

      <!-- 底部信息 (标题 + 简介 + 标签) -->
      <scroll-view scroll-y class="video-play__info-scroll">
        <view class="video-play__info">
          <text class="video-play__title">{{ video.title }}</text>

          <view class="video-play__chips">
            <text v-if="video.category" class="video-play__chip">
              {{ categoryLabel(video.category) }}
            </text>
            <text
              v-for="t in video.tags || []"
              :key="t"
              class="video-play__chip video-play__chip--tag"
            >
              #{{ t }}
            </text>
          </view>

          <view v-if="video.intro" class="video-play__intro">
            <text>{{ video.intro }}</text>
          </view>
        </view>
      </scroll-view>
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
  computed: {
    // 2026-07-03: 只对 mp4 直链走原生 <video autoplay>; H5 嵌入页 / embed url 走 web-view
    // 浏览器 autoplay policy 要求 muted 才能 autoplay
    isMp4() {
      const u = (this.video?.videoUrl || '').toLowerCase()
      return /\.mp4(\?|#|$)/.test(u)
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

    // 视频元素 play 事件触发 (H5 进页即自动播放时也会触发)
    // 兜底: 如果 <video autoplay> 因任何原因未触发 (老 Safari / 网络慢), 也保证计入 viewCount
    onVideoPlay() {
      if (!this.played) {
        this.bumpPlay()
      }
    },

    goBack() {
      uni.navigateBack({ delta: 1 })
    },

    formatDuration(s) {
      if (!s || s <= 0) return ''
      const m = Math.floor(s / 60)
      const sec = s % 60
      return `${m}:${String(sec).padStart(2, '0')}`
    },

    categoryLabel(key) {
      return CATEGORY_LABELS[key] || key
    }
  }
}
</script>

<style lang="scss" scoped>
.video-play {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;

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

  // 顶栏 (60rpx) — 不遮挡视野
  &__bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: $spacing-sm $spacing-md;
    background: $bg-card;
    border-bottom: 1rpx solid rgba(0, 0, 0, 0.06);
  }
  &__back {
    width: 64rpx;
    height: 64rpx;
    border-radius: 50%;
    background: $bg-page;
    @include flex-center;

    & > text {
      font-size: 40rpx;
      color: $text-primary;
      line-height: 1;
    }
  }
  &__bar-meta {
    display: flex;
    gap: $spacing-md;
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__duration {
    font-weight: $font-weight-medium;
  }

  // 播放器区 (60vh+) — 用户点开即看到视频在播
  &__player {
    width: 100%;
    height: 60vh;
    min-height: 480rpx;
    background: #000;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  &__video,
  &__webview {
    width: 100%;
    height: 100%;
    object-fit: contain;     // 视频保持宽高比, 留黑边
    background: #000;
  }
  &__nostub {
    @include flex-center;
    width: 100%;
    height: 100%;
    color: rgba(255, 255, 255, 0.5);
    font-size: $font-base;
  }

  // 信息滚动区
  &__info-scroll {
    flex: 1;
    max-height: 30vh;
  }
  &__info {
    padding: $spacing-md;
  }
  &__title {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.4;
    margin-bottom: $spacing-sm;
  }
  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
    margin-bottom: $spacing-md;
  }
  &__chip {
    padding: 4rpx 14rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-xs;
    border-radius: $radius-pill;

    &--tag {
      background: $bg-page;
      color: $text-secondary;
    }
  }
  &__intro {
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    color: $text-primary;
    font-size: $font-sm;
    line-height: 1.7;
    box-shadow: $shadow-card;
  }
}
</style>
