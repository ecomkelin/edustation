<!--
  探索 Tab (2026-07-03 全面改造)
  - 顶层 banner (科普主题) + 3 个内容 section
  - 📖 趣味科普   — 头条 1 + 列表 3 (最新 4 篇)
  - 🎬 趣味科普视频 — 1 个默认推荐 + 「查看所有」CTA (R-3800 featured + 跳 video-list)
  - 🎮 趣味小游戏  — 全量分页 (R-3701, 加载更多式 pageSize=12)
  - 内容由 platform 平台超管统一发布 (R-3600/3700/3800), 跨机构对所有 C 端家长可见
-->
<template>
  <view class="explore">
    <view class="explore__top">
      <view class="explore__bg-circle explore__bg-circle--1" />
      <view class="explore__bg-circle explore__bg-circle--2" />

      <view class="explore__hero safe-area-top">
        <text class="explore__hero-title">🌍 一起探索世界</text>
        <text class="explore__hero-sub">
          趣味科普 · 科普视频 · 动手小游戏
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
        <!-- 视频 (2026-07-03 新增, MM=38, 排在文章之上: 视频更具视觉吸引, 优先抓住眼球) -->
        <view class="explore__section">
          <view class="section-title">
            <text>🎬 趣味科普视频</text>
            <text class="section-title__more">{{ totalVideos }} 个</text>
          </view>

          <view v-if="videoLoading && !featuredVideo" class="explore__loading">
            <text>召唤中…</text>
          </view>

          <view v-else-if="!featuredVideo" class="explore__empty">
            <text class="explore__empty-emoji">🎬</text>
            <text class="explore__empty-title">科普视频在路上</text>
            <text class="explore__empty-desc">平台会持续更新, 敬请期待 ›</text>
          </view>

          <view v-else>
            <!-- 视频英雄位 (最新 1 个大图卡) -->
            <view
              class="explore__featured explore__featured--video press"
              @tap="goVideo(featuredVideo._id)"
            >
              <view
                class="explore__featured-cover"
                :style="{ background: videoEmojiBg(featuredVideo.meta?.coverEmoji) }"
              >
                <text class="explore__featured-cover-emoji">
                  {{ featuredVideo.meta?.coverEmoji || '🎬' }}
                </text>
                <view class="explore__featured-play">
                  <text>▶</text>
                </view>
                <view
                  v-if="featuredVideo.durationSeconds"
                  class="explore__featured-duration"
                >
                  <text>{{ formatDuration(featuredVideo.durationSeconds) }}</text>
                </view>
              </view>
              <view class="explore__featured-body">
                <text class="explore__featured-title">{{ featuredVideo.title }}</text>
                <text class="explore__featured-summary">{{ featuredVideo.intro }}</text>
                <view class="explore__featured-meta">
                  <text v-if="featuredVideo.category" class="explore__featured-tag">
                    {{ categoryLabel(featuredVideo.category) }}
                  </text>
                  <text class="explore__featured-cta">立即观看 ›</text>
                </view>
              </view>
            </view>

            <!-- 「查看所有」CTA -->
            <view class="explore__more press" @tap="goVideoList">
              <text>查看全部视频 ›</text>
            </view>
          </view>
        </view>

        <!-- 文章 -->
        <view class="explore__section">
          <view class="section-title">
            <text>📖 趣味科普</text>
            <text class="section-title__more">{{ totalArticles }} 篇</text>
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

            <!-- 其余文章列表 (除头条, 最多 3 篇; spec: 最新 3-5 个) -->
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

        <!-- 游戏 (2026-07-03 改造: 加载更多式分页) -->
        <view class="explore__section">
          <view class="section-title">
            <text>🎮 趣味小游戏</text>
            <text class="section-title__more">{{ totalGames }} 款</text>
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

            <!-- 游戏加载更多 -->
            <view v-if="gamesHasMore" class="explore__more">
              <view
                v-if="!gamesLoadingMore"
                class="explore__loadmore press"
                @tap="loadMoreGames"
              >
                <text>加载更多</text>
              </view>
              <text v-else class="explore__more-tip">加载中…</text>
            </view>
            <view v-else-if="games.length" class="explore__end">
              <text>— 已经到底了 —</text>
            </view>
          </view>
        </view>

        <view class="explore__bottom-spacer" />
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { articleApi } from '@/api/article'
import { videoApi } from '@/api/video'
import { gameApi } from '@/api/game'
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

const ARTICLE_PAGE_SIZE = 12      // 一次拉够, 客户端截 4
const GAME_PAGE_SIZE = 12          // 加载更多式: 每页 12 (一般总数也少, 1-2 页拉完)

export default {
  data() {
    return {
      // 文章 — 一次性拉最多 12 篇 (按 publishedAt desc), 截 1 头条 + 3 列表
      articles: [],
      articlesLoading: false,
      totalArticles: 0,

      // 视频 — featured 1 个 + total (用于角标)
      featuredVideo: null,
      videoLoading: false,
      totalVideos: 0,

      // 游戏 — 加载更多式
      games: [],
      gamesLoading: false,
      gamesLoadingMore: false,
      totalGames: 0,
      gamesPage: 1,
      gamesHasMore: true
    }
  },
  computed: {
    featuredArticle() {
      return this.articles[0] || null
    },
    otherArticles() {
      // spec: 最新 3-5 个 (1 头条 + 3 列表 = 4)
      return this.articles.slice(1, 4)
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
      await Promise.all([
        this.loadArticles(),
        this.loadFeaturedVideo(),
        this.loadGames(true)
      ])
    },

    async loadArticles() {
      this.articlesLoading = true
      try {
        // 拉一页 12 篇, 客户端取前 4 (1 头条 + 3 列表)
        const res = await articleApi.list({ pageSize: ARTICLE_PAGE_SIZE })
        const data = res?.data || res || {}
        const items = this._extractItems(data)
        this.articles = items.slice(0, 4)
        this.totalArticles = typeof data.total === 'number'
          ? data.total
          : items.length
      } catch (e) {
        console.warn('[explore.loadArticles]', e)
        this.articles = []
      } finally {
        this.articlesLoading = false
      }
    },

    async loadFeaturedVideo() {
      this.videoLoading = true
      try {
        const res = await videoApi.featured()
        const data = res?.data || res || {}
        // featured 返单条 doc; total 从 list 接口拿 (或者用 featured 自己字段)
        this.featuredVideo = data && data._id ? data : null
        if (!this.totalVideos) {
          // 顺手查 list 拿 total (轻量, pageSize=1)
          try {
            const lr = await videoApi.list({ pageSize: 1 })
            const ld = lr?.data || lr || {}
            if (typeof ld.total === 'number') this.totalVideos = ld.total
          } catch { /* 非关键 */ }
        }
      } catch (e) {
        console.warn('[explore.loadFeaturedVideo]', e)
        this.featuredVideo = null
      } finally {
        this.videoLoading = false
      }
    },

    async loadGames(reset) {
      if (reset) {
        this.gamesLoading = true
        this.games = []
        this.gamesPage = 1
        this.gamesHasMore = true
      } else {
        this.gamesLoadingMore = true
      }
      try {
        const targetPage = reset ? 1 : this.gamesPage + 1
        const res = await gameApi.list({ page: targetPage, pageSize: GAME_PAGE_SIZE })
        const data = res?.data || res || {}
        const items = this._extractItems(data)
        if (reset) {
          this.games = items
        } else {
          this.games = this.games.concat(items)
        }
        this.gamesPage = (typeof data.page === 'number' ? data.page : targetPage)
        this.totalGames = typeof data.total === 'number' ? data.total : this.games.length
        this.gamesHasMore = this.games.length < this.totalGames
      } catch (e) {
        console.warn('[explore.loadGames]', e)
        if (reset) this.games = []
        this.gamesHasMore = false
      } finally {
        this.gamesLoading = false
        this.gamesLoadingMore = false
      }
    },

    async loadMoreGames() {
      if (this.gamesLoadingMore || !this.gamesHasMore) return
      haptic.tap()
      await this.loadGames(false)
    },

    // 服务端返 {items: [...]} / {data: [...]} / [...] 多态兜底
    _extractItems(data) {
      if (Array.isArray(data)) return data
      if (Array.isArray(data.items)) return data.items
      if (Array.isArray(data.data)) return data.data
      return []
    },

    goArticle(id) {
      if (!id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/content/article-detail?id=${id}` })
    },

    goVideo(id) {
      if (!id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/content/video-play?id=${id}` })
    },

    goVideoList() {
      haptic.tap()
      uni.navigateTo({ url: '/pages/content/video-list' })
    },

    goGame(g) {
      if (!g || !g._id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/content/game-launch?id=${g._id}` })
    },

    formatDate(d) {
      if (!d) return ''
      return date.fmtDate(d)
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

    // 视频专属 emoji 渐变 (深色宇宙蓝调为主)
    videoEmojiBg(e) {
      const map = {
        '🪐': 'linear-gradient(135deg, #5B9EE6, #4F46E5)',
        '🌌': 'linear-gradient(135deg, #1E40AF, #5B9EE6)',
        '🌊': 'linear-gradient(135deg, #5B9EE6, #7CD9B7)',
        '🦕': 'linear-gradient(135deg, #7CD9B7, #F5C148)',
        '🌋': 'linear-gradient(135deg, #FF8A65, #F5C148)',
        '🔬': 'linear-gradient(135deg, #B197FC, #5B9EE6)',
        '🚀': 'linear-gradient(135deg, #FF8A65, #B197FC)'
      }
      return map[e] || 'linear-gradient(135deg, #4F46E5, #5B9EE6)'
    },

    onLower() {
      // 滚动到底: 给游戏加载更多一个机会 (避免用户必须找按钮)
      if (this.gamesHasMore && !this.gamesLoadingMore && this.games.length > 0) {
        this.loadMoreGames()
      }
    }
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

  // ─── 头条文章 / 视频 (共用大图样式) ───
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
    position: relative;
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

  // 视频版头条 (加 ▶ 按钮 + 时长 badge)
  &__featured-play {
    position: absolute;
    width: 80rpx;
    height: 80rpx;
    background: rgba(0, 0, 0, 0.45);
    border-radius: 50%;
    @include flex-center;
    border: 3rpx solid rgba(255, 255, 255, 0.6);

    & > text {
      color: #fff;
      font-size: 32rpx;
      margin-left: 6rpx;
    }
  }
  &__featured-duration {
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

  // ─── 「查看全部视频」CTA ───
  &__more {
    text-align: center;
    padding: $spacing-md 0;

    & > text {
      color: $text-secondary;
      font-size: $font-sm;
    }
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
    padding: $spacing-md 0 $spacing-lg;
    color: $text-tertiary;
    font-size: $font-xs;
    // 跨整个 grid 满宽
    grid-column: 1 / -1;
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

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>
