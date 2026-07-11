<!--
  消息 tab (2026-07-11 v0.9 立项)
  - 二级 tab 切换: "系统消息" (Inbox) / "AI 客服" (原 chat.vue 业务)
  - chat-detail.vue 路由不变 (从「AI 客服」tab 点对话进)
  - Inbox 数据来源 R-4002 (activeStudent 校验)
  - 红点数 R-4003
  - 历史: chat.vue 改名而来, 把 AI 客服降为二级 tab
-->
<template>
  <view class="messages">
    <!-- 二级 tab -->
    <view class="messages__tabs">
      <view
        v-for="t in tabs"
        :key="t.key"
        :class="['messages__tab', { 'messages__tab--active': tab === t.key }]"
        @tap="onTabChange(t.key)"
      >
        <text>{{ t.label }}</text>
        <text v-if="t.key === 'inbox' && unreadCount > 0" class="messages__tab-badge">{{ unreadCount }}</text>
      </view>
    </view>

    <!-- 主体: 二级路由 -->
    <view v-if="tab === 'inbox'" class="messages__panel">
      <InboxList />
    </view>
    <view v-else class="messages__panel">
      <AiChatList />
    </view>
  </view>
</template>

<script>
import { notificationApi } from '@/api/notification'
import InboxList from '@/components/messages/InboxList.vue'
import AiChatList from '@/components/messages/AiChatList.vue'

export default {
  components: { InboxList, AiChatList },
  data() {
    return {
      tab: 'inbox',
      unreadCount: 0,
      tabs: [
        { key: 'inbox', label: '系统消息' },
        { key: 'ai', label: 'AI 客服' }
      ]
    }
  },
  onShow() {
    this.loadUnread()
  },
  methods: {
    onTabChange(key) {
      this.tab = key
      if (key === 'inbox') this.loadUnread()
    },
    async loadUnread() {
      try {
        const res = await notificationApi.unreadCount()
        const data = res && res.data ? res.data : res
        this.unreadCount = (data && data.count) || 0
      } catch (e) {
        this.unreadCount = 0
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.messages {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;

  &__tabs {
    display: flex;
    background: $bg-card;
    border-bottom: 1rpx solid $divider-light;
    padding: 0 $spacing-md;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  &__tab {
    flex: 1;
    padding: $spacing-md 0;
    text-align: center;
    font-size: $font-base;
    color: $text-secondary;
    position: relative;
    transition: color .2s;
    &--active {
      color: $primary;
      font-weight: $font-weight-semibold;
    }
    &--active::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 50%;
      transform: translateX(-50%);
      width: 48rpx;
      height: 4rpx;
      background: $primary;
      border-radius: 2rpx;
    }
  }
  &__tab-badge {
    display: inline-block;
    margin-left: 6rpx;
    min-width: 32rpx;
    height: 32rpx;
    padding: 0 8rpx;
    background: $danger;
    color: #fff;
    border-radius: 16rpx;
    text-align: center;
    font-size: $font-xs;
    line-height: 32rpx;
  }
  &__tab-badge { color: #fff; }
  &__panel {
    flex: 1;
  }
}
</style>