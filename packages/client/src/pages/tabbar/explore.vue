<!--
  探索 Tab (2026-07-03 全面改造)
  - 原 child.vue: 课程产品列表 (discover.vue 内容), 已下线
  - 新: 顶层 banner (科普主题) + 2 个内容 section (科普文章 + 趣味小游戏)
  - 内容由 platform 平台超管统一发布 (R-3600 / R-3700), 跨机构对所有 C 端家长可见
-->
<template>
  <view class="explore">
    <view class="explore__top">
      <view class="explore__bg-circle explore__bg-circle--1" />
      <view class="explore__bg-circle explore__bg-circle--2" />

      <view class="explore__hero safe-area-top">
        <text class="explore__hero-title">🌍 一起探索世界</text>
        <text class="explore__hero-sub">
          趣味科普 · 动手小游戏
        </text>
        <text class="explore__hero-tag">让好奇心, 带着孩子一起长大 ›</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="explore__body"
      @scrolltolower="onLower"
    >
      <view class="explore__body-inner">
        <!-- 文章 -->
        <view class="explore__section">
          <view class="section-title">
            <text>📖 趣味科普</text>
            <text class="section-title__more">{{ articles.length }} 篇</text>
          </view>

          <view v-if="articlesLoading && !articles.length" class="explore__loading">
            <text>召唤中…</text>
          </view>

          <view v-else-if="!articles.length" class="explore__empty">
            <text class="explore__empty-emoji">📖</text>
            <text class="explore__empty-title">科普文章在路上</text>
            <text class="explore__empty-desc">平台会持续更新, 敬请期待 ›</text>
          </view>

          <view v-else>
            <!-- 头条 (第一篇大图卡) -->
            <view
              v-if="featuredArticle"
              class="explore__featured press"
              @tap="goArticle(featuredArticle._id)"
            >
              <view
                class="explore__featured-cover"
                :style="{ background: emojiBg(featuredArticle.meta?.coverEmoji) }"
              >
                <text class="explore__featured-cover-emoji">
                  {{ featuredArticle.meta?.coverEmoji || '📖' }}
                </text>
              </view>
              <view class="explore__featured-body">
                <text class="explore__featured-title">{{ featuredArticle.title }}</text>
                <text class="explore__featured-summary">{{ featuredArticle.summary }}</text>
                <view class="explore__featured-meta">
                  <text v-if="featuredArticle.category" class="explore__featured-tag">
                    {{ categoryLabel(featuredArticle.category) }}
                  </text>
                  <text class="explore__featured-cta">阅读全文 ›</text>
                </view>
              </view>
            </view>

            <!-- 其余文章列表 (除头条) -->
            <view class="explore__article-list">
              <view
                v-for="a in otherArticles"
                :key="a._id"
                class="explore__article-item press"
                @tap="goArticle(a._id)"
              >
                <view
                  class="explore__article-emoji-box"
                  :style="{ background: emojiBg(a.meta?.coverEmoji) }"
                >
                  <text class="explore__article-emoji">{{ a.meta?.coverEmoji || '📄' }}</text>
                </view>
                <view class="explore__article-info">
                  <text class="explore__article-title">{{ a.title }}</text>
                  <text class="explore__article-summary">{{ a.summary }}</text>
                  <view class="explore__article-meta">
                    <text v-if="a.category" class="explore__article-tag">
                      {{ categoryLabel(a.category) }}
                    </text>
                    <text class="explore__article-date">{{ formatDate(a.publishedAt) }}</text>
                  </view>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 游戏 -->
        <view class="explore__section">
          <view class="section-title">
            <text>🎮 趣味小游戏</text>
            <text class="section-title__more">{{ games.length }} 款</text>
          </view>

          <view v-if="gamesLoading && !games.length" class="explore__loading">
            <text>召唤中…</text>
          </view>

          <view v-else-if="!games.length" class="explore__empty">
            <text class="explore__empty-emoji">🎮</text>
            <text class="explore__empty-title">小游戏在路上</text>
            <text class="explore__empty-desc">边玩边学, 敬请期待 ›</text>
          </view>

          <view v-else class="explore__game-grid">
            <view
              v-for="g in games"
              :key="g._id"
              class="explore__game-card press"
              @tap="goGame(g)"
            >
              <view
                class="explore__game-cover"
                :style="{ background: emojiBg(g.meta?.coverEmoji, '#5B9EE6') }"
              >
                <text class="explore__game-emoji">{{ g.meta?.coverEmoji || '🎮' }}</text>
                <!-- 难度徽章 -->
                <view v-if="g.difficulty" class="explore__game-difficulty" :style="{ background: difficultyColor(g.difficulty) }">
                  <text>{{ difficultyLabel(g.difficulty) }}</text>
                </view>
              </view>
              <view class="explore__game-body">
                <text class="explore__game-name">{{ g.name }}</text>
                <text class="explore__game-intro">{{ g.intro }}</text>
                <view class="explore__game-tags">
                  <text
                    v-for="t in (g.tags || []).slice(0, 2)"
                    :key="t"
                    class="explore__game-tag"
                  >
                    {{ t }}
                  </text>
                </view>
                <view class="explore__game-cta">
                  <text>▶ 立即开玩</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 底部 CTA -->
        <view class="explore__more press" @tap="onMoreTap">
          <text>查看全部内容 ›</text>
        </view>

        <view class="explore__bottom-spacer" />
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { articleApi } from '@/api/article'
import { gameApi } from '@/api/game'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'
import { toast } from '@/components/common/Toast'

const CATEGORY_LABELS = {
  science: '科学',
  parenting: '育儿',
  safety: '安全',
  activity: '活动',
  art: '艺术'
}

const DIFFICULTY_LABELS = {
  easy: '简单',
  medium: '中等',
  hard: '困难'
}

const DIFFICULTY_COLORS = {
  easy: '#7CD9B7',
  medium: '#F5C148',
  hard: '#FF8A65'
}

export default {
  data() {
    return {
      articles: [],
      articlesLoading: false,
      games: [],
      gamesLoading: false
    }
  },
  computed: {
    featuredArticle() {
      return this.articles[0] || null
    },
    otherArticles() {
      return this.articles.slice(1)
    }
  },
  onShow() {
    this.load()
  },
  onPullDownRefresh() {
    this.load().finally(() => uni.stopPullDownRefresh())
  },
  methods: {
    async load() {
      this.loadArticles()
      this.loadGames()
    },

    async loadArticles() {
      this.articlesLoading = true
      try {
        const res = await articleApi.list({ pageSize: 12 })
        // http 拦截器可能返 res.data 或直接 res, 兼容 [memory: http-interceptor-actually-unpacked]
        const data = res?.data || res || {}
        this.articles = Array.isArray(data.items) ? data.items
          : Array.isArray(data.data) ? data.data
          : Array.isArray(data) ? data
          : []
      } catch (e) {
        console.warn('[explore.loadArticles]', e)
        this.articles = []
      } finally {
        this.articlesLoading = false
      }
    },

    async loadGames() {
      this.gamesLoading = true
      try {
        const res = await gameApi.list({ pageSize: 12 })
        const data = res?.data || res || {}
        this.games = Array.isArray(data.items) ? data.items
          : Array.isArray(data.data) ? data.data
          : Array.isArray(data) ? data
          : []
      } catch (e) {
        console.warn('[explore.loadGames]', e)
        this.games = []
      } finally {
        this.gamesLoading = false
      }
    },

    goArticle(id) {
      if (!id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/content/article-detail?id=${id}` })
    },

    goGame(g) {
      if (!g || !g._id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/content/game-launch?id=${g._id}` })
    },

    onMoreTap() {
      haptic.tap()
      toast.text('全部内容敬请期待 ›')
    },

    formatDate(d) {
      if (!d) return ''
      return date.fmtDate(d)
    },

    categoryLabel(key) {
      return CATEGORY_LABELS[key] || key
    },

    difficultyLabel(d) {
      return DIFFICULTY_LABELS[d] || ''
    },

    difficultyColor(d) {
      return DIFFICULTY_COLORS[d] || 'rgba(0,0,0,0.3)'
    },

    // emoji 卡片背景: 不同类型用不同渐变色
    emojiBg(emoji, fallback) {
      const map = {
        '💻': 'linear-gradient(135deg, #5B9EE6, #4F46E5)',
        '🎨': 'linear-gradient(135deg, #F5C148, #FF8A65)',
        '🛡️': 'linear-gradient(135deg, #7CD9B7, #5B9EE6)',
        '🔢': 'linear-gradient(135deg, #B197FC, #FF8A65)',
        '🈚': 'linear-gradient(135deg, #FF8A65, #F5C148)',
        '🌍': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)'
      }
      return map[emoji] || (fallback ? `linear-gradient(135deg, ${fallback}, #FF8A65)` : 'linear-gradient(135deg, #FFB088, #FF8A65)')
    },

    onLower() { /* 预留无限滚动 */ }
  }
}
</script>

<style lang="scss" scoped>
.explore {
  min-height: 100vh;
  background: $bg-page;
  padding-top: env(safe-area-inset-top);

  &__top {
    background: linear-gradient(180deg, #B197FC 0%, #F0E5FF 60%, $bg-page 100%);
    padding-bottom: $spacing-md;
    position: relative;
    overflow: hidden;
  }

  &__bg-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.35;
    animation: float 6s ease-in-out infinite;
    pointer-events: none;

    &--1 {
      width: 280rpx;
      height: 280rpx;
      background: radial-gradient(circle, #FF8A65 0%, transparent 70%);
      top: -60rpx;
      right: -80rpx;
    }
    &--2 {
      width: 220rpx;
      height: 220rpx;
      background: radial-gradient(circle, #5B9EE6 0%, transparent 70%);
      top: 100rpx;
      left: -50rpx;
      animation-delay: 2s;
    }
  }

  &__hero {
    position: relative;
    padding: $spacing-md $spacing-lg $spacing-md;
  }
  &__hero-title {
    display: block;
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }
  &__hero-sub {
    display: block;
    font-size: $font-base;
    color: $primary-dark;
    margin-bottom: 4rpx;
  }
  &__hero-tag {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__body {
    height: calc(100vh - 240rpx);
  }

  &__body-inner {
    padding: 0 $spacing-lg;
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
    font-size: 64rpx;
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

  // ─── 头条文章 (大图) ───
  &__featured {
    background: $bg-card;
    border-radius: $radius-md;
    overflow: hidden;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-sm;
  }
  &__featured-cover {
    width: 100%;
    height: 240rpx;
    @include flex-center;
  }
  &__featured-cover-emoji {
    font-size: 96rpx;
    filter: drop-shadow(0 4rpx 8rpx rgba(0, 0, 0, 0.15));
  }
  &__featured-body {
    padding: $spacing-md;
  }
  &__featured-title {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
    @include multi-ellipsis(2);
  }
  &__featured-summary {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.5;
    margin-bottom: $spacing-sm;
    @include multi-ellipsis(2);
  }
  &__featured-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  &__featured-tag {
    padding: 4rpx 16rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }
  &__featured-cta {
    font-size: $font-sm;
    color: $primary;
    font-weight: $font-weight-medium;
  }

  // ─── 文章列表 ───
  &__article-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }
  &__article-item {
    display: flex;
    align-items: stretch;
    padding: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__article-emoji-box {
    width: 120rpx;
    height: 120rpx;
    border-radius: $radius-md;
    @include flex-center;
    flex-shrink: 0;
    margin-right: $spacing-sm;
  }
  &__article-emoji {
    font-size: 56rpx;
  }
  &__article-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  &__article-title {
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
    @include multi-ellipsis(1);
  }
  &__article-summary {
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.4;
    margin-bottom: $spacing-xs;
    @include multi-ellipsis(2);
    flex: 1;
  }
  &__article-meta {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
  }
  &__article-tag {
    padding: 2rpx 10rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }
  &__article-date {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  // ─── 游戏 grid ───
  &__game-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: $spacing-sm;
  }
  &__game-card {
    background: $bg-card;
    border-radius: $radius-md;
    overflow: hidden;
    box-shadow: $shadow-card;
  }
  &__game-cover {
    width: 100%;
    height: 200rpx;
    @include flex-center;
    position: relative;
  }
  &__game-emoji {
    font-size: 80rpx;
    filter: drop-shadow(0 4rpx 8rpx rgba(0, 0, 0, 0.15));
  }
  &__game-difficulty {
    position: absolute;
    top: $spacing-xs;
    right: $spacing-xs;
    padding: 4rpx 12rpx;
    border-radius: $radius-pill;
    & > text { color: #fff; font-size: $font-xs; font-weight: $font-weight-medium; }
  }
  &__game-body {
    padding: $spacing-sm;
  }
  &__game-name {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
    @include multi-ellipsis(1);
  }
  &__game-intro {
    display: block;
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.4;
    margin-bottom: $spacing-xs;
    @include multi-ellipsis(2);
    height: 60rpx;
  }
  &__game-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4rpx;
    margin-bottom: $spacing-xs;
  }
  &__game-tag {
    padding: 2rpx 10rpx;
    background: $bg-page;
    color: $text-tertiary;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }
  &__game-cta {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 6rpx 0;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    font-size: $font-xs;
    font-weight: $font-weight-medium;
    border-radius: $radius-pill;
    & > text { color: inherit; }
  }

  // ─── 底部 ───
  &__more {
    text-align: center;
    padding: $spacing-md 0;
    color: $text-secondary;
    font-size: $font-sm;
  }
  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>
