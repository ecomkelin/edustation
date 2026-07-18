<!--
  InboxList.vue - 消息 tab「系统消息」列表
  - 数据源 R-4002 /notifications/me
  - 单条点击 → R-4004 标已读 + 跳 payload.deeplink
  - 长按单条 → 弹出 ActionSheet (删除) → 调 R-4006 archive (2026-07-18 新增)
    注意: 客户端"删除"= 后端 archive (软归档), 用户视角删了, DB 留 90d 兜底可恢复
  - 顶部 tab: 未读 / 全部 (2026-07-12 业务决策: 客户端"删除=归档", 归档后自己看不到, 不展示归档 tab)
  - 空态: 未读 tab → "您没有未读消息"; 全部 tab → "暂无系统消息"
-->
<template>
  <view class="inbox">
    <!-- 顶部子 tab + 操作 -->
    <view class="inbox__bar">
      <view class="inbox__sub-tabs">
        <text
          v-for="t in subTabs"
          :key="t.key"
          :class="['inbox__sub-tab', { 'inbox__sub-tab--active': subTab === t.key }]"
          @tap="subTab = t.key"
        >{{ t.label }}</text>
      </view>
      <text v-if="items.length > 0 && unreadCount > 0" class="inbox__action" @tap="onReadAll">一键已读</text>
    </view>

    <scroll-view scroll-y class="inbox__list" :refresher-enabled="true" :refresher-triggered="refreshing" @refresherrefresh="onRefresh">
      <view v-if="loading && !items.length" class="inbox__loading">
        <text>加载中…</text>
      </view>

      <view v-else-if="!items.length" class="inbox__empty">
        <view class="inbox__empty-art">
          <text>📭</text>
        </view>
        <text class="inbox__empty-title">暂无系统消息</text>
        <text class="inbox__empty-desc">课程提醒、作业到期、订单通知会出现在这里</text>
      </view>

      <view v-else class="inbox__items">
        <view
          v-for="n in items"
          :key="n._id"
          :class="['inbox__item', { 'inbox__item--unread': n.status === 'unread' }]"
          @tap="onTap(n)"
          @longpress="onLongPress(n)"
        >
          <view class="inbox__item-icon">
            <text>{{ iconOf(n.type) }}</text>
          </view>
          <view class="inbox__item-body">
            <view class="inbox__item-row">
              <text class="inbox__item-title">{{ n.title || n.type }}</text>
              <text class="inbox__item-time">{{ formatTime(n.createdAt) }}</text>
            </view>
            <text class="inbox__item-summary">{{ n.body }}</text>
          </view>
          <view v-if="n.status === 'unread'" class="inbox__item-dot" />
        </view>
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { notificationApi } from '@/api/notification'

const TYPE_ICON = {
  lesson_remind_1h: '📚',
  lesson_remind_24h: '📅',
  lesson_absent: '⚠️',
  task_due: '📝',
  task_assigned: '📋',
  task_comment: '💬',
  order_paid: '💰',
  order_refunded: '↩️',
  evaluation_published: '⭐',
  point_grant: '🎁',
  point_deduct: '💸',
  pet_critical: '🐾',
  access_stranger: '🚨',
  system_notice: '📢'
}

export default {
  data() {
    return {
      loading: false,
      refreshing: false,
      items: [],
      unreadCount: 0,
      // 2026-07-12 业务决策: 进入消息页默认显示「未读」(红点驱动),「全部」tab 是兜底查历史用
      subTab: 'unread',
      subTabs: [
        { key: 'unread', label: '未读' },
        { key: 'all', label: '全部' }
      ]
    }
  },
  watch: {
    subTab() {
      this.load()
    }
  },
  // 2026-07-11: 用 mounted 替代 onShow (InboxList 是 component 而非 page, onShow 仅 page 生效, component 不会触发)
// 2026-07-12: 保留 mounted; 同时改 subTabs 为 [未读, 全部] - 移除"已归档" tab (客户端"删除=归档", 归档后自己看不到)
mounted() {
  this.load()
},
onPullDownRefresh() {
  this.load().then(() => uni.stopPullDownRefresh())
},
  methods: {
    iconOf(type) {
      return TYPE_ICON[type] || '🔔'
    },
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
    onTap(n) {
      // 标已读 (幂等) — 即便用户只瞥一眼列表, 也算「看过」, 减少红点误判
      if (n.status === 'unread') {
        notificationApi.markRead(n._id).catch(() => {})
        n.status = 'read'
        n.readAt = new Date()
        this.unreadCount = Math.max(0, this.unreadCount - 1)
      }
      // 2026-07-18: 跳「消息详情」中间页 (R-4019), 不再直接 deeplink — 详情页里有"前往查看"按钮再跳业务
      uni.navigateTo({ url: `/pages/notification/detail?id=${n._id}` })
    },
    // 2026-07-18: 长按弹出操作菜单 (删除) — 客户端"删除"= 后端 archive 软归档
    //   90d 后由 notificationPurgeCron 物理清理, 中间窗口 DB 保留供兜底恢复
    onLongPress(n) {
      uni.showActionSheet({
        itemList: ['删除'],
        success: (res) => {
          if (res.tapIndex === 0) {
            this.confirmDelete(n)
          }
        },
        fail: () => { /* 取消 */ }
      })
    },
    async confirmDelete(n) {
      // 二次确认: 删除后该消息不再可见, 防误触
      uni.showModal({
        title: '删除消息',
        content: '删除后将不再显示, 确定吗?',
        confirmText: '删除',
        confirmColor: '#f56c6c',
        success: async (r) => {
          if (!r.confirm) return
          try {
            await notificationApi.archive(n._id)
            // 2026-07-18: 本地直接剔, 不 reload 整个列表 (load 会重新拉接口, 体验割裂)
            const idx = this.items.findIndex((x) => x._id === n._id)
            if (idx !== -1) this.items.splice(idx, 1)
            if (n.status === 'unread') {
              this.unreadCount = Math.max(0, this.unreadCount - 1)
            }
            uni.showToast({ title: '已删除', icon: 'success' })
          } catch (e) {
            uni.showToast({ title: '删除失败', icon: 'none' })
          }
        }
      })
    },
    async onReadAll() {
      try {
        await notificationApi.markAllRead()
        this.items = this.items.map((n) => ({ ...n, status: 'read', readAt: new Date() }))
        this.unreadCount = 0
        uni.showToast({ title: '已全部标为已读', icon: 'success' })
      } catch (e) {
        uni.showToast({ title: '操作失败', icon: 'none' })
      }
    },
    async load() {
      this.loading = true
      try {
        const params = { page: 1, pageSize: 50 }
        if (this.subTab === 'unread') params.status = 'unread'
        const res = await notificationApi.listMe(params)
        const data = res && res.data ? res.data : res
        this.items = (data && data.items) || []
        this.unreadCount = this.items.filter((n) => n.status === 'unread').length
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
.inbox {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;

  &__bar {
    display: flex;
    align-items: center;
    padding: $spacing-xs $spacing-md;
    background: $bg-card;
    border-bottom: 1rpx solid $divider-light;
  }
  &__sub-tabs {
    flex: 1;
    display: flex;
    gap: $spacing-md;
  }
  &__sub-tab {
    font-size: $font-sm;
    color: $text-secondary;
    padding: 4rpx 0;
    &--active {
      color: $primary;
      font-weight: $font-weight-semibold;
      border-bottom: 2rpx solid $primary;
    }
  }
  &__action {
    font-size: $font-sm;
    color: $primary;
  }

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
    padding: $spacing-xs $spacing-md;
  }
  &__item {
    display: flex;
    align-items: flex-start;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    margin-bottom: $spacing-xs;
    box-shadow: $shadow-card;
    position: relative;
    &--unread {
      background: lighten($primary-lighter, 4%);
    }
  }
  &__item-icon {
    width: 72rpx; height: 72rpx;
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
    margin-bottom: 6rpx;
  }
  &__item-title {
    font-size: $font-base;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    font-weight: $font-weight-medium;
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
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    word-break: break-all;
  }
  &__item-dot {
    width: 16rpx; height: 16rpx;
    border-radius: 50%;
    background: $danger;
    position: absolute;
    top: 16rpx;
    right: 16rpx;
  }
}
</style>