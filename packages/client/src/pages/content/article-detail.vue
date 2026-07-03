<!--
  科普文章详情 (R-3601)
  顶部大字 hero (emoji cover) + v-html contentHtml 渲染
-->
<template>
  <view class="article-detail">
    <view v-if="loading" class="article-detail__loading">
      <text>召唤中…</text>
    </view>

    <view v-else-if="!article" class="article-detail__empty">
      <text class="article-detail__empty-emoji">📄</text>
      <text class="article-detail__empty-title">文章不存在或已下架</text>
    </view>

    <template v-else>
      <!-- 顶部 hero -->
      <view
        class="article-detail__hero"
        :style="{ background: heroBg }"
      >
        <view class="article-detail__hero-emoji-box">
          <text class="article-detail__hero-emoji">{{ article.meta?.coverEmoji || '📖' }}</text>
        </view>
        <view
          v-if="article.category"
          class="article-detail__hero-tag"
        >
          <text>{{ categoryLabel(article.category) }}</text>
        </view>
      </view>

      <view class="article-detail__body">
        <text class="article-detail__title">{{ article.title }}</text>
        <view class="article-detail__meta">
          <text class="article-detail__meta-date">{{ formatDate(article.publishedAt) }}</text>
          <text class="article-detail__meta-view">阅读 {{ article.viewCount || 0 }}</text>
        </view>
        <view v-if="article.summary" class="article-detail__summary">
          <text>{{ article.summary }}</text>
        </view>

        <view class="article-detail__content">
          <rich-text :nodes="article.contentHtml || ''" />
        </view>

        <view class="article-detail__bottom-spacer" />
      </view>
    </template>
  </view>
</template>

<script>
import { articleApi } from '@/api/article'
import { date } from '@/utils/date'

const CATEGORY_LABELS = {
  science: '科学',
  parenting: '育儿',
  safety: '安全',
  activity: '活动',
  art: '艺术'
}

// 跟 explore.vue emojiBg 映射同步
const EMOJI_BG = {
  '💻': 'linear-gradient(135deg, #5B9EE6, #4F46E5)',
  '🎨': 'linear-gradient(135deg, #F5C148, #FF8A65)',
  '🛡️': 'linear-gradient(135deg, #7CD9B7, #5B9EE6)',
  '🔢': 'linear-gradient(135deg, #B197FC, #FF8A65)',
  '🈚': 'linear-gradient(135deg, #FF8A65, #F5C148)',
  '🌍': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)'
}

export default {
  data() {
    return {
      loading: true,
      article: null
    }
  },
  computed: {
    heroBg() {
      const e = this.article?.meta?.coverEmoji
      return EMOJI_BG[e] || 'linear-gradient(135deg, #FFB088, #B197FC)'
    }
  },
  onLoad(query) {
    if (query && query.id) {
      this.id = query.id
      this.load()
    }
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await articleApi.detail(this.id)
        const data = res?.data || res || {}
        this.article = data
      } catch (e) {
        console.warn('[articleDetail.load]', e)
        this.article = null
      } finally {
        this.loading = false
      }
    },

    formatDate(d) {
      if (!d) return ''
      return date.fmtDate(d)
    },

    categoryLabel(key) {
      return CATEGORY_LABELS[key] || key
    }
  }
}
</script>

<style lang="scss" scoped>
.article-detail {
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
    height: 360rpx;
    @include flex-center;
    position: relative;
  }
  &__hero-emoji-box {
    width: 200rpx;
    height: 200rpx;
    background: rgba(255, 255, 255, 0.85);
    border-radius: 48rpx;
    @include flex-center;
    box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.18);
  }
  &__hero-emoji {
    font-size: 120rpx;
  }
  &__hero-tag {
    position: absolute;
    top: $spacing-md;
    left: $spacing-md;
    padding: 6rpx 20rpx;
    background: rgba(255, 255, 255, 0.85);
    color: $primary-dark;
    font-size: $font-sm;
    border-radius: $radius-pill;
  }

  &__body {
    background: $bg-page;
    border-top-left-radius: $radius-lg;
    border-top-right-radius: $radius-lg;
    padding: $spacing-lg $spacing-md;
    margin-top: -40rpx;
    position: relative;
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
    gap: $spacing-md;
    font-size: $font-xs;
    color: $text-tertiary;
    margin-bottom: $spacing-md;
  }
  &__summary {
    padding: $spacing-sm $spacing-md;
    background: $primary-lighter;
    border-radius: $radius-md;
    color: $text-primary;
    font-size: $font-sm;
    line-height: 1.6;
    margin-bottom: $spacing-md;
  }

  &__content {
    font-size: $font-base;
    color: $text-primary;
    line-height: 1.8;
  }
  &__bottom-spacer {
    height: $spacing-2xl;
  }
}
</style>
