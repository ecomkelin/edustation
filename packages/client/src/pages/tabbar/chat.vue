<!--
  消息 tab (2026-07-02 立项 C 端 4 tab 重构)
  - 顶部 sticky "AI 客服"卡 → 跳 /pages/tabbar/chat-detail?type=support
  - 历史会话列表 (从 R-2810 拉, 后端已过滤 meta.supportUser)
  - 命名规范: chat.vue 是 tab2, 原 agent/chat.vue 改名为 chat-detail.vue
-->
<template>
  <view class="chat">
    <!-- 顶部: AI 客服 sticky 卡 -->
    <view class="chat__ai-card press" @tap="goSupport">
      <view class="chat__ai-avatar">
        <text>🤖</text>
      </view>
      <view class="chat__ai-info">
        <view class="chat__ai-name-row">
          <text class="chat__ai-name">人工智网 · 客服助理</text>
          <text class="chat__ai-tag">平台</text>
        </view>
        <text class="chat__ai-desc">您好,有什么可以帮您?关于课程/订单/孩子学习都能问我</text>
      </view>
      <view class="chat__ai-status">
        <view class="chat__ai-dot" />
        <text class="chat__ai-status-text">在线</text>
      </view>
    </view>

    <!-- 历史会话 -->
    <view class="chat__section-title">
      <text>最近对话</text>
    </view>

    <scroll-view scroll-y class="chat__list" :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <view v-if="loading && !items.length" class="chat__loading">
        <text>加载中…</text>
      </view>

      <view v-else-if="!items.length" class="chat__empty">
        <view class="chat__empty-art">
          <text>💬</text>
        </view>
        <text class="chat__empty-title">还没有对话过</text>
        <text class="chat__empty-desc">点上面"客服助理"卡片开始第一次咨询</text>
      </view>

      <view v-else class="chat__items">
        <view
          v-for="c in items"
          :key="c._id"
          class="chat__item press"
          @tap="goDetail(c._id)"
        >
          <view class="chat__item-avatar">
            <text>{{ c.isPinned ? '📌' : '💭' }}</text>
          </view>
          <view class="chat__item-body">
            <view class="chat__item-row">
              <text class="chat__item-title">{{ c.title || '新会话' }}</text>
              <text class="chat__item-time">{{ formatTime(c.lastMessageAt || c.updatedAt) }}</text>
            </view>
            <text class="chat__item-summary">{{ c.summary || '点击查看对话' }}</text>
          </view>
          <view v-if="(c.userMessageCount || 0) > 0" class="chat__item-badge">
            <text>{{ c.userMessageCount }}</text>
          </view>
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { conversationApi } from '@/api/agent'

export default {
  data() {
    return {
      loading: false,
      refreshing: false,
      items: []
    }
  },
  onShow() {
    this.load()
  },
  onPullDownRefresh() {
    this.load().then(() => uni.stopPullDownRefresh())
  },
  methods: {
    formatTime(d) {
      if (!d) return ''
      const t = new Date(d)
      const now = new Date()
      const ms = now - t
      const min = Math.floor(ms / 60000)
      const hr = Math.floor(min / 60)
      if (min < 1) return '刚刚'
      if (min < 60) return `${min} 分钟前`
      if (hr < 24) return `${hr} 小时前`
      const day = Math.floor(hr / 24)
      if (day < 7) return `${day} 天前`
      const m = String(t.getMonth() + 1).padStart(2, '0')
      const dd = String(t.getDate()).padStart(2, '0')
      return `${m}-${dd}`
    },
    goSupport() {
      uni.navigateTo({ url: '/pages/tabbar/chat-detail?type=support' })
    },
    goDetail(id) {
      uni.navigateTo({ url: `/pages/tabbar/chat-detail?id=${encodeURIComponent(id)}` })
    },
    async load() {
      this.loading = true
      try {
        // 后端 R-2810 list 已经过滤掉 meta.supportUser=true
        const res = await conversationApi.list({ limit: 50 })
        const data = res && res.data ? res.data : res
        this.items = (data && data.items) || []
      } catch (e) {
        this.items = []
      } finally {
        this.loading = false
        this.refreshing = false
      }
    },
    onRefresh() {
      this.refreshing = true
      this.load()
    }
  }
}
</script>

<style lang="scss" scoped>
.chat {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;

  /* AI 客服卡 */
  &__ai-card {
    display: flex;
    align-items: center;
    margin: $spacing-md;
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary-lighter, $accent-light);
    border-radius: $radius-lg;
    box-shadow: $shadow-card-hover;
  }
  &__ai-avatar {
    width: 80rpx; height: 80rpx;
    border-radius: 50%;
    background: $bg-card;
    @include flex-center;
    font-size: 40rpx;
    flex-shrink: 0;
  }
  &__ai-info {
    flex: 1;
    margin: 0 $spacing-md;
    min-width: 0;
  }
  &__ai-name-row {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
  }
  &__ai-name {
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }
  &__ai-tag {
    background: $primary;
    color: #fff;
    font-size: $font-xs;
    padding: 2rpx 8rpx;
    border-radius: $radius-pill;
  }
  &__ai-tag > text { color: inherit; }
  &__ai-desc {
    font-size: $font-sm;
    color: $text-secondary;
    margin-top: 4rpx;
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__ai-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    flex-shrink: 0;
  }
  &__ai-dot {
    width: 12rpx; height: 12rpx;
    background: $accent;
    border-radius: 50%;
  }
  &__ai-status-text {
    font-size: $font-xs;
    color: $text-secondary;
  }

  /* 列表 */
  &__section-title {
    padding: 0 $spacing-md $spacing-xs;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__section-title > text { color: inherit; }

  &__list {
    flex: 1;
    height: calc(100vh - 200rpx);
  }
  &__loading, &__empty {
    padding: $spacing-2xl;
    text-align: center;
    color: $text-tertiary;
  }
  &__empty-art {
    width: 160rpx; height: 160rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    @include flex-center;
    font-size: 80rpx;
    margin: 0 auto $spacing-md;
  }
  &__empty-title {
    font-size: $font-base;
    color: $text-secondary;
    margin-bottom: 4rpx;
    display: block;
  }
  &__empty-desc {
    font-size: $font-sm;
    color: $text-tertiary;
    display: block;
  }

  &__items {
    padding: 0 $spacing-md;
  }
  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    margin-bottom: $spacing-xs;
    box-shadow: $shadow-card;
  }
  &__item-avatar {
    width: 80rpx; height: 80rpx;
    border-radius: 50%;
    background: $bg-page;
    @include flex-center;
    font-size: 36rpx;
    flex-shrink: 0;
  }
  &__item-body {
    flex: 1;
    margin: 0 $spacing-sm;
    min-width: 0;
  }
  &__item-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4rpx;
  }
  &__item-title {
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__item-time {
    font-size: $font-xs;
    color: $text-tertiary;
    flex-shrink: 0;
    margin-left: $spacing-xs;
  }
  &__item-summary {
    font-size: $font-sm;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: block;
  }
  &__item-badge {
    min-width: 36rpx;
    height: 36rpx;
    padding: 0 8rpx;
    background: $danger;
    color: #fff;
    border-radius: 18rpx;
    @include flex-center;
    font-size: $font-xs;
  }
  &__item-badge > text { color: inherit; }
}
</style>
