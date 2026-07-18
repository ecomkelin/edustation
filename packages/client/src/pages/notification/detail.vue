<!--
  pages/notification/detail.vue - 系统消息详情页 (2026-07-18 新增)
  - 数据源: R-4019 GET /api/v1/notifications/:id
  - onLoad: 拉详情 + 同时 markRead (若 unread) — 推迟到详情页进入时才标, 符合 SaaS UX 范式
  - 显示: 类型 icon + 类型名 + 状态 chip + title + body (完整不省略) + meta 行 (时间/类型/关联实体) + 渠道分发明细
  - 操作:
    - 「前往查看」主按钮 (仅当 payload.deeplink 存在) → uni.navigateTo 跳业务页
    - 「删除」次按钮 → 调 R-4006 archive, 删除后 navigateBack
  - 路由: /pages/notification/detail?id=xxx
-->
<template>
  <view class="n-detail">
    <view v-if="loading" class="n-detail__loading">
      <text>加载中...</text>
    </view>

    <view v-else-if="!item" class="n-detail__empty">
      <text class="n-detail__empty-icon">📭</text>
      <text class="n-detail__empty-text">消息不存在或已被删除</text>
    </view>

    <scroll-view v-else scroll-y class="n-detail__body">
      <!-- 头部: icon + 类型 + 状态 -->
      <view class="n-detail__hero">
        <view class="n-detail__hero-icon">
          <text class="n-detail__hero-emoji">{{ iconOf(item.type) }}</text>
        </view>
        <view class="n-detail__hero-tags">
          <text class="n-detail__hero-type">{{ typeLabelOf(item.type) }}</text>
          <text :class="['n-detail__hero-chip', `n-detail__hero-chip--${item.status}`]">
            {{ statusLabelOf(item.status, item.archivedAt) }}
          </text>
        </view>
      </view>

      <!-- 标题 -->
      <view class="n-detail__title-wrap">
        <text class="n-detail__title">{{ item.title || item.type }}</text>
      </view>

      <!-- 正文 (完整, 不省略) -->
      <view class="n-detail__body-content">
        <text class="n-detail__body-text">{{ item.body }}</text>
      </view>

      <!-- 元信息 -->
      <view class="n-detail__meta">
        <view class="n-detail__meta-row">
          <text class="n-detail__meta-label">🕐 接收时间</text>
          <text class="n-detail__meta-value">{{ formatDateTime(item.createdAt) }}</text>
        </view>
        <view v-if="item.readAt" class="n-detail__meta-row">
          <text class="n-detail__meta-label">👁 阅读时间</text>
          <text class="n-detail__meta-value">{{ formatDateTime(item.readAt) }}</text>
        </view>
        <view v-if="item.archivedAt" class="n-detail__meta-row">
          <text class="n-detail__meta-label">📦 归档时间</text>
          <text class="n-detail__meta-value">{{ formatDateTime(item.archivedAt) }}</text>
        </view>
        <view v-if="item.payload && item.payload.entityType" class="n-detail__meta-row">
          <text class="n-detail__meta-label">🔗 关联业务</text>
          <text class="n-detail__meta-value">{{ item.payload.entityType }}</text>
        </view>
      </view>

      <!-- 渠道分发明细 (审计透明: 用户能看见这条通知走了哪些渠道, 状态如何) -->
      <view v-if="channels.length" class="n-detail__channels">
        <text class="n-detail__section-title">📡 发送渠道</text>
        <view
          v-for="ch in channels"
          :key="ch.channel"
          :class="['n-detail__channel', `n-detail__channel--${ch.status}`]"
        >
          <text class="n-detail__channel-name">{{ channelLabel(ch.channel) }}</text>
          <text :class="['n-detail__channel-status', `n-detail__channel-status--${ch.status}`]">
            {{ channelStatusLabel(ch) }}
          </text>
        </view>
      </view>
    </scroll-view>

    <!-- 底部操作栏 -->
    <view v-if="item" class="n-detail__footer">
      <view
        v-if="!item.archivedAt"
        class="n-detail__btn n-detail__btn--secondary"
        @tap="onDelete"
      >
        <text>删除</text>
      </view>
      <view
        v-if="item.payload && item.payload.deeplink"
        class="n-detail__btn n-detail__btn--primary"
        @tap="onGoDeeplink"
      >
        <text>前往查看 →</text>
      </view>
    </view>
  </view>
</template>

<script>
import { notificationApi } from '@/api/notification'

// 与 InboxList.vue 对齐: type → icon
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

// type → 中文标签 (与 admin StaffInbox.typeLabels 一致)
const TYPE_LABELS = {
  task_assigned: '任务分配',
  task_rejected: '任务打回',
  task_approved: '任务通过',
  task_cancelled: '任务取消',
  task_due: '任务到期',
  task_comment: '任务评论',
  lesson_preparing: '排课准备',
  lesson_prepare_reminder: '上课通知',
  lesson_remind_24h: '上课提醒',
  lesson_remind_1h: '课前 1h 提醒',
  lesson_absent: '缺勤',
  order_paid: '订单已付',
  order_refunded: '订单退款',
  evaluation_published: '课评发布',
  point_grant: '积分到账',
  point_deduct: '积分扣减',
  pet_critical: '宠物异常',
  access_stranger: '陌生人告警',
  system_notice: '系统通知'
}

// 渠道 → 中文 + icon (与 channels[].channel enum 对齐: inbox/wechatMini/wechatPublic/sms/push/websocket)
const CHANNEL_LABELS = {
  inbox: '站内',
  wechatMini: '微信小程序',
  wechatPublic: '微信公众号',
  sms: '短信',
  push: 'App 推送',
  websocket: '实时'
}

const CHANNEL_STATUS_LABELS = {
  pending: '发送中',
  sent: '已送达',
  failed: '失败',
  skipped: '已跳过'
}

export default {
  data() {
    return {
      loading: true,
      item: null,
      id: null
    }
  },
  onLoad(query) {
    this.id = query && query.id
    if (!this.id) {
      this.loading = false
      return
    }
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await notificationApi.detail(this.id)
        const data = res && res.data ? res.data : res
        this.item = data || null
        // 2026-07-18: 进入详情页自动 markRead (若 unread) — 推迟到详情, 符合 SaaS UX
        if (this.item && this.item.status === 'unread') {
          try {
            await notificationApi.markRead(this.item._id)
            this.item.status = 'read'
            this.item.readAt = new Date().toISOString()
          } catch (e) {
            // 静默: 详情已加载, markRead 失败不影响阅读
          }
        }
        // 动态改导航栏标题
        uni.setNavigationBarTitle({ title: this.item ? '消息详情' : '消息' })
      } catch (e) {
        this.item = null
      } finally {
        this.loading = false
      }
    },
    iconOf(type) {
      return TYPE_ICON[type] || '🔔'
    },
    typeLabelOf(type) {
      return TYPE_LABELS[type] || type
    },
    statusLabelOf(status, archivedAt) {
      if (archivedAt) return '已归档'
      if (status === 'unread') return '未读'
      if (status === 'read') return '已读'
      if (status === 'archived') return '已归档'
      return ''
    },
    channelLabel(ch) {
      return CHANNEL_LABELS[ch] || ch
    },
    channelStatusLabel(ch) {
      if (ch.reason === 'opted_out') return '已关闭'
      if (ch.reason === 'no_capability') return '未开通'
      if (ch.reason === 'rate_limited') return '频率受限'
      if (ch.reason === 'invalid_target') return '目标无效'
      return CHANNEL_STATUS_LABELS[ch.status] || ch.status
    },
    formatDateTime(d) {
      if (!d) return ''
      const t = new Date(d)
      const pad = (n) => String(n).padStart(2, '0')
      return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`
    },
    onGoDeeplink() {
      const dl = this.item && this.item.payload && this.item.payload.deeplink
      if (!dl) return
      uni.navigateTo({ url: dl, fail: () => {
        uni.showToast({ title: '页面跳转失败', icon: 'none' })
      } })
    },
    async onDelete() {
      // 二次确认 (与 InboxList 长按删除对齐)
      const r = await new Promise((resolve) => {
        uni.showModal({
          title: '删除消息',
          content: '删除后将不再显示, 确定吗?',
          confirmText: '删除',
          confirmColor: '#f56c6c',
          success: (m) => resolve(m.confirm),
          fail: () => resolve(false)
        })
      })
      if (!r) return
      try {
        await notificationApi.archive(this.item._id)
        uni.showToast({ title: '已删除', icon: 'success' })
        setTimeout(() => uni.navigateBack(), 600)
      } catch (e) {
        uni.showToast({ title: '删除失败', icon: 'none' })
      }
    }
  },
  computed: {
    channels() {
      if (!this.item || !this.item.channels) return []
      return this.item.channels
    }
  }
}
</script>

<style lang="scss" scoped>
.n-detail {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;

  &__loading, &__empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: $text-tertiary;
    padding: $spacing-2xl;
  }
  &__empty-icon { font-size: 80rpx; margin-bottom: $spacing-md; }
  &__empty-text { font-size: $font-base; color: $text-secondary; }

  &__body {
    flex: 1;
    padding: $spacing-md;
    padding-bottom: 200rpx; // 留 footer 空间
  }

  // 头部
  &__hero {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    margin-bottom: $spacing-md;
  }
  &__hero-icon {
    width: 80rpx; height: 80rpx;
    border-radius: 50%;
    background: $bg-card;
    @include flex-center;
    flex-shrink: 0;
    box-shadow: $shadow-card;
  }
  &__hero-emoji { font-size: 40rpx; }
  &__hero-tags {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    flex-wrap: wrap;
  }
  &__hero-type {
    font-size: $font-sm;
    color: $text-secondary;
  }
  &__hero-chip {
    font-size: $font-xs;
    padding: 4rpx 12rpx;
    border-radius: 8rpx;
    &--unread {
      background: $danger;
      color: #fff;
    }
    &--read {
      background: $bg-page;
      color: $text-tertiary;
    }
    &--archived {
      background: $text-tertiary;
      color: #fff;
    }
  }

  // 标题
  &__title-wrap {
    margin-bottom: $spacing-md;
  }
  &__title {
    font-size: 36rpx;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.5;
  }

  // 正文
  &__body-content {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }
  &__body-text {
    font-size: $font-base;
    color: $text-primary;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }

  // 元数据
  &__meta {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }
  &__meta-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-xs 0;
    border-bottom: 1rpx solid $divider-light;
    &:last-child { border-bottom: none; }
  }
  &__meta-label {
    font-size: $font-sm;
    color: $text-secondary;
    flex-shrink: 0;
  }
  &__meta-value {
    font-size: $font-sm;
    color: $text-primary;
    text-align: right;
    margin-left: $spacing-sm;
  }

  // 渠道
  &__channels {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
  }
  &__section-title {
    font-size: $font-base;
    color: $text-primary;
    font-weight: $font-weight-semibold;
    display: block;
    margin-bottom: $spacing-sm;
  }
  &__channel {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-xs $spacing-sm;
    border-radius: $radius-sm;
    margin-bottom: $spacing-xs;
    background: $bg-page;
    &:last-child { margin-bottom: 0; }
  }
  &__channel-name {
    font-size: $font-sm;
    color: $text-secondary;
  }
  &__channel-status {
    font-size: $font-xs;
    padding: 2rpx 12rpx;
    border-radius: 6rpx;
    // 客户端暖橙主题, 无 $success 变量 — 复用 $primary-light 表达「已送达」, 与危险 $danger / 警告 $warning 形成对比
    &--sent { background: $primary-light; color: #fff; }
    &--pending { background: $warning; color: #fff; }
    &--failed { background: $danger; color: #fff; }
    &--skipped { background: $text-tertiary; color: #fff; }
  }

  // 底部操作栏
  &__footer {
    position: fixed;
    left: 0; right: 0; bottom: 0;
    background: $bg-card;
    border-top: 1rpx solid $divider-light;
    padding: $spacing-sm $spacing-md;
    display: flex;
    gap: $spacing-sm;
    box-shadow: 0 -2rpx 8rpx rgba(0, 0, 0, 0.04);
  }
  &__btn {
    flex: 1;
    height: 80rpx;
    border-radius: $radius-md;
    @include flex-center;
    font-size: $font-base;
    &--primary {
      background: $primary;
      color: #fff;
      font-weight: $font-weight-semibold;
    }
    &--secondary {
      background: $bg-page;
      color: $danger;
      border: 1rpx solid $danger;
    }
  }
}
</style>
