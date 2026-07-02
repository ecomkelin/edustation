<!--
  作品墙 - 家长看自家孩子的作品 (2026-07-01 实装)
  - R-1670 GET /student-works/me (request.js 自动注入 x-active-student-id)
  - 2 列 grid 卡片，瀑布流视觉 (统一方形缩略图)
  - 下拉刷新 + 触底加载
-->
<template>
  <view class="wall">
    <!-- 顶部摘要 + 筛选 -->
    <view class="wall__head">
      <view class="wall__summary">
        <text class="wall__summary-val">{{ summary.total }}</text>
        <text class="wall__summary-lbl">件作品</text>
        <text class="wall__summary-dot">·</text>
        <text class="wall__summary-val">{{ summary.rated }}</text>
        <text class="wall__summary-lbl">已评</text>
        <text v-if="summary.avgLevel" class="wall__summary-dot">·</text>
        <text v-if="summary.avgLevel" class="wall__summary-val">{{ summary.avgLevel }}</text>
        <text v-if="summary.avgLevel" class="wall__summary-lbl">/ 5 平均</text>
      </view>

      <!-- 媒体类型 tab -->
      <view class="wall__tabs">
        <view
          v-for="t in tabs"
          :key="t.key"
          class="wall__tab"
          :class="{ 'wall__tab--active': filter.media === t.key }"
          @tap="onTabTap(t.key)"
        >
          <text>{{ t.label }}</text>
        </view>
      </view>
    </view>

    <!-- 列表 -->
    <scroll-view
      scroll-y
      class="wall__body"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onRefresh"
      @scrolltolower="onLower"
    >
      <view v-if="loading && !items.length" class="wall__loading">
        <text>加载中...</text>
      </view>

      <view v-else-if="!items.length" class="wall__empty">
        <view class="wall__empty-art">
          <text>🎨</text>
        </view>
        <text class="wall__empty-title">还没有作品</text>
        <text class="wall__empty-desc">老师布置作品后,这里会显示孩子的精彩瞬间</text>
        <view class="wall__empty-btn press" @tap="goUpload">
          <text>上传第一件作品</text>
        </view>
      </view>

      <view v-else class="wall__grid">
        <view
          v-for="w in items"
          :key="w._id"
          class="wall__tile press"
          @tap="goDetail(w._id)"
        >
          <image
            v-if="firstFile(w)"
            class="wall__tile-img"
            :src="firstFile(w)"
            mode="aspectFill"
            @tap.stop="previewImg(w)"
          />
          <view v-else class="wall__tile-noimg">
            <text>无图</text>
          </view>

          <!-- 视频角标 -->
          <view v-if="hasVideo(w)" class="wall__tile-badge">
            <text>▶ 视频</text>
          </view>

          <view class="wall__tile-overlay">
            <view v-if="w.level" class="wall__tile-level">
              <text class="wall__tile-level-text">★ {{ w.level }}</text>
            </view>
            <view class="wall__tile-title">
              <text>{{ w.title }}</text>
            </view>
            <view v-if="w.lessonSchedule && w.lessonSchedule.plannedStartTime" class="wall__tile-time">
              <text>{{ date.fmtShort(w.lessonSchedule.plannedStartTime) }}</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载更多状态 -->
      <view v-if="items.length" class="wall__more">
        <text v-if="loadingMore">加载中…</text>
        <text v-else-if="!hasMore">— 没有更多了 —</text>
      </view>
    </scroll-view>

    <!-- 浮动 + 上传按钮 -->
    <view class="wall__fab press" @tap="goUpload">
      <text>＋</text>
    </view>
  </view>
</template>

<script>
import { studentWorkApi } from '@/api/studentWork'
import { useStudentStore } from '@/stores/student'
import { date } from '@/utils/date'

export default {
  data() {
    return {
      loading: false,
      loadingMore: false,
      refreshing: false,
      items: [],
      page: 1,
      pageSize: 20,
      total: 0,
      summary: { total: 0, rated: 0, avgLevel: null },
      filter: {
        media: 'all' // all | image | video
      },
      tabs: [
        { key: 'all', label: '全部' },
        { key: 'image', label: '有图' },
        { key: 'video', label: '有视频' }
      ]
    }
  },
  computed: {
    studentId() {
      return useStudentStore().activeStudentId
    },
    hasMore() {
      return this.items.length < this.total
    }
  },
  watch: {
    studentId: {
      handler() {
        this.reload()
      },
      immediate: false
    }
  },
  onShow() {
    // 切回本页时刷新 (从详情/上传 回来后)
    this.reload()
  },
  onPullDownRefresh() {
    this.reload().then(() => uni.stopPullDownRefresh())
  },
  methods: {
    isVideoUrl(url) {
      if (!url) return false
      return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i.test(url)
    },
    firstFile(w) {
      const urls = w && w.fileUrls
      if (!urls || !urls.length) return ''
      return urls[0] || ''
    },
    hasVideo(w) {
      const urls = w && w.fileUrls
      if (!urls || !urls.length) return false
      return urls.some((u) => this.isVideoUrl(u))
    },
    matchMediaFilter(w) {
      if (this.filter.media === 'all') return true
      const urls = (w && w.fileUrls) || []
      if (!urls.length) return this.filter.media === 'all'
      if (this.filter.media === 'video') return urls.some((u) => this.isVideoUrl(u))
      if (this.filter.media === 'image') return urls.some((u) => !this.isVideoUrl(u))
      return true
    },
    onTabTap(key) {
      if (this.filter.media === key) return
      this.filter.media = key
      this.reload()
    },
    async reload() {
      this.loading = true
      this.page = 1
      try {
        const res = await studentWorkApi.me({ page: 1, pageSize: this.pageSize })
        const data = res && res.data ? res.data : res
        const rawItems = data && data.items ? data.items : (Array.isArray(data) ? data : [])
        const total = data && typeof data.total === 'number' ? data.total : rawItems.length
        this.total = total
        const filtered = rawItems.filter((w) => this.matchMediaFilter(w))
        this.items = filtered
        this.updateSummary(rawItems)
      } catch (e) {
        this.items = []
        this.summary = { total: 0, rated: 0, avgLevel: null }
      } finally {
        this.loading = false
        this.refreshing = false
      }
    },
    async loadMore() {
      if (this.loadingMore || !this.hasMore || this.filter.media !== 'all') return
      this.loadingMore = true
      try {
        const next = this.page + 1
        const res = await studentWorkApi.me({ page: next, pageSize: this.pageSize })
        const data = res && res.data ? res.data : res
        const rawItems = data && data.items ? data.items : (Array.isArray(data) ? data : [])
        const total = data && typeof data.total === 'number' ? data.total : rawItems.length
        this.total = total
        this.page = next
        // 仅在 all tab 模式下追加，过滤 tab 下的更多数据暂不展示 (UX 一致性)
        this.items = [...this.items, ...rawItems]
      } finally {
        this.loadingMore = false
      }
    },
    onRefresh() {
      this.refreshing = true
      this.reload()
    },
    onLower() {
      this.loadMore()
    },
    updateSummary(rawItems) {
      const total = rawItems.length
      const rated = rawItems.filter((w) => w.level).length
      const sum = rawItems.reduce((acc, w) => acc + (w.level || 0), 0)
      this.summary = {
        total,
        rated,
        avgLevel: rated > 0 ? Number((sum / rated).toFixed(2)) : null
      }
    },
    goDetail(id) {
      uni.navigateTo({ url: `/pages/work/detail?id=${encodeURIComponent(id)}` })
    },
    goUpload() {
      uni.navigateTo({ url: '/pages/work/upload' })
    },
    previewImg(w) {
      const urls = (w && w.fileUrls) || []
      const imgs = urls.filter((u) => !this.isVideoUrl(u))
      if (!imgs.length) {
        // 都是视频：走详情页
        return this.goDetail(w._id)
      }
      uni.previewImage({ urls: imgs, indicator: 'number', loop: true })
    }
  }
}
</script>

<style lang="scss" scoped>
.wall {
  min-height: 100vh;
  background: $bg-page;
  padding-bottom: 120rpx;

  &__head {
    background: $bg-card;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    position: sticky;
    top: 0;
    z-index: 10;
  }

  &__summary {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: $spacing-xs;
    color: $text-secondary;
    font-size: $font-sm;
  }
  &__summary-val {
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $primary;
  }
  &__summary-dot {
    color: $text-tertiary;
  }

  &__tabs {
    display: flex;
    gap: $spacing-md;
    margin-top: $spacing-sm;
  }
  &__tab {
    padding: 12rpx 24rpx;
    border-radius: $radius-pill;
    font-size: $font-sm;
    color: $text-secondary;
    background: $bg-page;

    &--active {
      background: $primary;
      color: #fff;
      font-weight: $font-weight-medium;
    }
  }

  &__body {
    height: calc(100vh - 220rpx);
    padding: $spacing-sm;
  }

  &__loading,
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    color: $text-secondary;
  }
  &__empty-art {
    width: 200rpx;
    height: 200rpx;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-md;
    box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.18);
  }
  &__empty-art > text {
    font-size: 96rpx;
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
    margin-bottom: $spacing-md;
    text-align: center;
    max-width: 480rpx;
  }
  &__empty-btn {
    padding: 16rpx 40rpx;
    background: linear-gradient(135deg, $primary, $primary-dark);
    color: #fff;
    border-radius: $radius-pill;
    font-size: $font-base;
    box-shadow: 0 8rpx 16rpx rgba(255, 138, 101, 0.32);
  }
  &__empty-btn > text {
    color: inherit;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: $spacing-sm;
  }

  &__tile {
    position: relative;
    aspect-ratio: 1 / 1;
    background: $bg-card;
    border-radius: $radius-md;
    overflow: hidden;
    box-shadow: $shadow-card;
  }

  &__tile-img {
    width: 100%;
    height: 100%;
    display: block;
  }

  &__tile-noimg {
    @include flex-center;
    width: 100%;
    height: 100%;
    background: $bg-page;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  &__tile-badge {
    position: absolute;
    top: 12rpx;
    left: 12rpx;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    padding: 4rpx 12rpx;
    border-radius: $radius-pill;
    font-size: $font-xs;
  }
  &__tile-badge > text { color: inherit; }

  &__tile-overlay {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    padding: $spacing-xs $spacing-sm;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    color: #fff;
  }
  &__tile-overlay > * { color: #fff; }

  &__tile-level {
    position: absolute;
    top: -120rpx;
    right: $spacing-sm;
    background: $primary;
    color: #fff;
    padding: 4rpx 12rpx;
    border-radius: $radius-pill;
    font-size: $font-xs;
    box-shadow: 0 4rpx 8rpx rgba(0, 0, 0, 0.2);
  }

  &__tile-title {
    font-size: $font-sm;
    font-weight: $font-weight-medium;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &__tile-time {
    font-size: $font-xs;
    color: rgba(255, 255, 255, 0.78);
    margin-top: 4rpx;
  }
  &__tile-time > text { color: inherit; }

  &__more {
    padding: $spacing-lg 0;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__more > text { color: inherit; }

  &__fab {
    position: fixed;
    right: 40rpx;
    bottom: 80rpx;
    width: 100rpx;
    height: 100rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary, $primary-dark);
    box-shadow: 0 12rpx 24rpx rgba(255, 138, 101, 0.36);
    @include flex-center;
    color: #fff;
    font-size: 60rpx;
    font-weight: $font-weight-light;
    z-index: 20;
  }
  &__fab > text {
    color: inherit;
    line-height: 1;
  }
}
</style>
