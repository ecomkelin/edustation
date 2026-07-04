<!--
  科普文章列表 (R-3600)
  - 加载更多式分页 (每页 12 个)
  - 顶部 banner (暖色/文案区分于视频紫)
  - 单行卡片: emoji 方块 + 标题 + summary + 分类 tag + 发布时间
  - 点卡片走 article-detail
  - 2026-07-04 新增: 填补 explore.vue 文章段「查看全部文章」CTA 缺失
-->
<template>
  <view class="article-list">
    <view class="article-list__hero">
      <text class="article-list__hero-title">📖 趣味科普</text>
      <text class="article-list__hero-sub">让好奇心, 带着孩子一起长大 ›</text>
    </view>

    <view v-if="loading && !articles.length" class="article-list__loading">
      <text>召唤中…</text>
    </view>

    <view v-else-if="!articles.length" class="article-list__empty">
      <text class="article-list__empty-emoji">📖</text>
      <text class="article-list__empty-title">科普文章在路上</text>
      <text class="article-list__empty-desc">平台会持续更新, 敬请期待 ›</text>
    </view>

    <view v-else class="article-list__body">
      <view
        v-for="a in articles"
        :key="a._id"
        class="article-list__item press"
        @tap="goDetail(a)"
      >
        <view
          class="article-list__emoji-box"
          :style="{ background: emojiBg(a.meta?.coverEmoji) }"
        >
          <text class="article-list__emoji">{{ a.meta?.coverEmoji || '📄' }}</text>
        </view>
        <view class="article-list__info">
          <text class="article-list__title">{{ a.title }}</text>
          <text v-if="a.summary" class="article-list__summary">{{ a.summary }}</text>
          <view class="article-list__meta">
            <text v-if="a.category" class="article-list__cat">{{ categoryLabel(a.category) }}</text>
            <text class="article-list__date">{{ formatDate(a.publishedAt) }}</text>
          </view>
        </view>
      </view>

      <!-- 加载更多 / 结束态 -->
      <view v-if="hasMore" class="article-list__more">
        <view
          v-if="!loadingMore"
          class="article-list__loadmore press"
          @tap="loadMore"
        >
          <text>加载更多</text>
        </view>
        <text v-else class="article-list__more-tip">加载中…</text>
      </view>
      <view v-else-if="articles.length" class="article-list__end">
        <text>— 已经到底了 —</text>
      </view>
    </view>
  </view>
</template>

<script>
import { articleApi } from '@/api/article'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'

const CATEGORY_LABELS = {
  science: '科学',
  parenting: '育儿',
  safety: '安全',
  activity: '活动',
  art: '艺术',
  nature: '自然',
  space: '宇宙',
  history: '历史'
}

// 与 explore.vue emojiBg 同样的 6 个映射 (后续可共享到 utils); 不同模块 emoji 不同
const EMOJI_BG = {
  '🔢': 'linear-gradient(135deg, #B197FC, #FF8A65)',
  '🌍': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)',
  '🈚': 'linear-gradient(135deg, #FF8A65, #F5C148)',
  '🛡️': 'linear-gradient(135deg, #7CD9B7, #5B9EE6)',
  '🎨': 'linear-gradient(135deg, #F5C148, #FF8A65)',
  '💻': 'linear-gradient(135deg, #5B9EE6, #4F46E5)'
}

const PAGE_SIZE = 12

export default {
  data() {
    return {
      articles: [],
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
        const res = await articleApi.list({ page: p, pageSize: PAGE_SIZE })
        const data = res?.data || res || {}
        const items = Array.isArray(data.items) ? data.items
          : Array.isArray(data.data) ? data.data
          : Array.isArray(data) ? data
          : []
        this.total = typeof data.total === 'number' ? data.total : items.length
        if (replace) {
          this.articles = items
        } else {
          this.articles = this.articles.concat(items)
        }
        this.page = (typeof data.page === 'number' ? data.page : p)
        this.hasMore = this.articles.length < this.total
      } catch (e) {
        console.warn('[articleList.fetchPage]', e)
        if (replace) this.articles = []
        this.hasMore = false
      }
    },

    goDetail(a) {
      if (!a || !a._id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/content/article-detail?id=${a._id}` })
    },

    formatDate(d) {
      if (!d) return ''
      return date.fmtDate(d)
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
.article-list {
  min-height: 100vh;
  background: $bg-page;
  padding: $spacing-md $spacing-lg;

  &__hero {
    background: linear-gradient(135deg, #FF8A65 0%, #F5C148 100%);
    border-radius: $radius-md;
    padding: $spacing-md $spacing-lg;
    margin-bottom: $spacing-md;
    color: #fff;
    box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.3);
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

  &__item {
    display: flex;
    align-items: stretch;
    padding: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__emoji-box {
    width: 160rpx;
    height: 160rpx;
    border-radius: $radius-md;
    @include flex-center;
    flex-shrink: 0;
    margin-right: $spacing-sm;
  }
  &__emoji {
    font-size: 72rpx;
    filter: drop-shadow(0 4rpx 8rpx rgba(0, 0, 0, 0.15));
  }
  &__info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  &__title {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.4;
    margin-bottom: $spacing-xs;
    @include multi-ellipsis(2);
  }
  &__summary {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.5;
    margin-bottom: $spacing-xs;
    @include multi-ellipsis(3);
    flex: 1;
  }
  &__meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__cat {
    padding: 4rpx 12rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }
  &__date {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__more {
    text-align: center;
    padding: $spacing-md 0;
  }
  &__loadmore {
    display: inline-block;
    padding: 12rpx 40rpx;
    border: 2rpx solid $primary;
    color: $primary;
    border-radius: $radius-pill;
    font-size: $font-sm;

    & > text {
      color: inherit;
    }
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
