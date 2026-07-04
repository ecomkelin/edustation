<!--
  我的积分 - C 端家长视角
  数据源: R-2072 GET /points/me (强制 activeStudent)
  返回:
    student / balance / totalEarned / totalSpent / lastTransactionAt
    recentTransactions: Array<{ amount, trigger, reason{name}, operator{realName}, balanceAfter, remark, createdAt }>
-->
<template>
  <view class="pw">
    <!-- Hero: 当前孩子 + 余额大字 + 累计入账/出账 -->
    <view class="pw__hero">
      <view class="pw__hero-bg" />
      <view class="pw__hero-inner">
        <text class="pw__hero-label">{{ activeStudentName }}的积分</text>
        <view class="pw__hero-balance">
          <text class="pw__hero-balance-val">{{ account.balance || 0 }}</text>
          <text class="pw__hero-balance-unit">分</text>
        </view>
        <view class="pw__hero-stats">
          <view class="pw__hero-stat">
            <text class="pw__hero-stat-val">{{ account.totalEarned || 0 }}</text>
            <text class="pw__hero-stat-lbl">累计入账</text>
          </view>
          <view class="pw__hero-stat-divider" />
          <view class="pw__hero-stat">
            <text class="pw__hero-stat-val">{{ account.totalSpent || 0 }}</text>
            <text class="pw__hero-stat-lbl">累计支出</text>
          </view>
          <view class="pw__hero-stat-divider" />
          <view class="pw__hero-stat">
            <text class="pw__hero-stat-val pw__hero-stat-val--small">
              {{ lastTxLabel }}
            </text>
            <text class="pw__hero-stat-lbl">最近一笔</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 学生切换 (单孩子也无下拉箭头) -->
    <view class="pw__sub">
      <active-student-header @change="onStudentChange" />
    </view>

    <!-- 最近流水 (最多 8 条) -->
    <view class="pw__recent">
      <view class="pw__recent-head">
        <text class="pw__recent-title">最近流水</text>
        <text v-if="recent.length" class="pw__recent-more press" @tap="goAll">
          查看全部 ›
        </text>
      </view>

      <view v-if="loading && !recent.length" class="pw__skeleton">
        <view v-for="i in 4" :key="i" class="pw__skeleton-row" />
      </view>

      <view v-else-if="!recent.length" class="pw__empty">
        <text class="pw__empty-emoji">📜</text>
        <text class="pw__empty-title">还没有积分流水</text>
        <text class="pw__empty-desc">连续出勤 / 分享课程都能赚积分哦</text>
      </view>

      <view v-else class="pw__list">
        <view
          v-for="tx in recent"
          :key="tx._id"
          class="pw__row press"
          @tap="previewTx(tx)"
        >
          <text class="pw__row-emoji">{{ triggerMeta(tx.trigger).emoji }}</text>
          <view class="pw__row-body">
            <text class="pw__row-title">{{ txTitle(tx) }}</text>
            <text class="pw__row-sub">{{ txSub(tx) }}</text>
          </view>
          <view class="pw__row-amount-wrap">
            <text class="pw__row-amount" :class="amountClass(tx)">
              {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount }}
            </text>
            <text class="pw__row-time">{{ date.fmtTime(tx.createdAt) }}</text>
          </view>
        </view>
      </view>

      <view v-if="recent.length > MAX_PREVIEW" class="pw__bottom-hint">
        <text>仅展示最近 {{ MAX_PREVIEW }} 条, 全部流水去右上"查看全部"</text>
      </view>
    </view>

    <view class="pw__bottom-spacer" />
  </view>
</template>

<script>
import { mapState } from 'pinia'
import { useStudentStore } from '@/stores/student'
import ActiveStudentHeader from '@/components/layout/ActiveStudentHeader.vue'
import { pointsApi } from '@/api/points'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'

// 与 admin Points.vue 同步, 但适配 C 端: 加 emoji + 简化文案
const TRIGGER_META = {
  manual_earn: { label: '员工加分', emoji: '✨', dir: 'in' },
  manual_deduct: { label: '员工扣分', emoji: '🔻', dir: 'out' },
  order_earn: { label: '下单奖励', emoji: '🛒', dir: 'in' },
  attendance_earn: { label: '出勤奖励', emoji: '📚', dir: 'in' },
  streak_earn: { label: '连续出勤', emoji: '🔥', dir: 'in' },
  share_earn: { label: '分享奖励', emoji: '🎉', dir: 'in' },
  birthday_earn: { label: '生日奖励', emoji: '🎂', dir: 'in' },
  pet: { label: '宠物互动', emoji: '🐾', dir: 'out' },
  redemption: { label: '兑换扣分', emoji: '🎁', dir: 'out' },
  refund: { label: '冲正', emoji: '↩️', dir: 'neutral' }
}

export default {
  components: { ActiveStudentHeader },
  data() {
    return {
      loading: false,
      account: {
        balance: 0,
        totalEarned: 0,
        totalSpent: 0,
        lastTransactionAt: null
      },
      recent: [],
      MAX_PREVIEW: 8
    }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId', 'list']),
    activeStudentName() {
      const s = (this.list || []).find((x) => String(x.id) === String(this.activeStudentId))
      return s?.name || '当前孩子'
    },
    lastTxLabel() {
      if (!this.account.lastTransactionAt) return '—'
      const t = new Date(this.account.lastTransactionAt).getTime()
      const diffMs = Date.now() - t
      if (diffMs < 60 * 1000) return '刚刚'
      const mins = Math.floor(diffMs / (60 * 1000))
      if (mins < 60) return `${mins}分钟前`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours}小时前`
      const days = Math.floor(hours / 24)
      if (days < 30) return `${days}天前`
      return date.fmtDate(this.account.lastTransactionAt)
    }
  },
  watch: {
    activeStudentId() {
      this.load()
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await pointsApi.me()
        const data = res || {}
        this.account = {
          balance: data.balance || 0,
          totalEarned: data.totalEarned || 0,
          totalSpent: data.totalSpent || 0,
          lastTransactionAt: data.lastTransactionAt || null
        }
        const list = data.recentTransactions || []
        this.recent = list.map((x) => ({ ...x, _id: x._id || x.id }))
      } catch (e) {
        console.warn('[points.wallet]', e)
        this.recent = []
        this.account = {
          balance: 0,
          totalEarned: 0,
          totalSpent: 0,
          lastTransactionAt: null
        }
      } finally {
        this.loading = false
      }
    },
    onStudentChange() {
      this.load()
    },
    triggerMeta(trigger) {
      return TRIGGER_META[trigger] || { label: trigger || '其他', emoji: '💫', dir: 'neutral' }
    },
    txTitle(tx) {
      // 优先 reason.name (Category) > trigger label > '积分变动'
      if (tx.reason && tx.reason.name) return tx.reason.name
      return this.triggerMeta(tx.trigger).label
    },
    txSub(tx) {
      // 二行: 备注 / 操作人 / 余快照 / 时间
      const parts = []
      if (tx.remark) parts.push(tx.remark)
      if (tx.operator && (tx.operator.realName || tx.operator.mobile)) {
        parts.push(`由 ${tx.operator.realName || ''}${tx.operator.mobile ? ' · ' + tx.operator.mobile.slice(-4) : ''} 操作`)
      } else if (!tx.remark) {
        parts.push('系统自动')
      }
      parts.push(`余额 ${tx.balanceAfter}`)
      return parts.join(' · ')
    },
    amountClass(tx) {
      const dir = this.triggerMeta(tx.trigger).dir
      if (dir === 'in') return 'pw__row-amount--in'
      if (dir === 'out') return 'pw__row-amount--out'
      return 'pw__row-amount--neutral'
    },
    previewTx(tx) {
      haptic.tap()
      const meta = this.triggerMeta(tx.trigger)
      const sign = tx.amount > 0 ? '+' : ''
      uni.showToast({
        title: `${meta.label} ${sign}${tx.amount} (余额 ${tx.balanceAfter})`,
        icon: 'none'
      })
    },
    goAll() {
      haptic.tap()
      uni.navigateTo({ url: '/pages/points/transactions' })
    }
  }
}
</script>

<style lang="scss" scoped>
.pw {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);

  // hero: 渐变 (暖色) + 大 balance
  &__hero {
    position: relative;
    overflow: hidden;
    padding: $spacing-lg 0 $spacing-xl;
  }
  &__hero-bg {
    position: absolute;
    inset: 0;
    // 与 studentProduct 区分: 用更"财富感"的橙金色
    background: linear-gradient(180deg, $primary 0%, $primary-light 50%, #FFE4D3 100%);
    z-index: 0;
  }
  &__hero-inner {
    position: relative;
    z-index: 1;
    padding: 0 $spacing-lg;
  }
  &__hero-label {
    display: block;
    font-size: $font-sm;
    color: rgba(255, 255, 255, 0.85);
    margin-bottom: $spacing-sm;
  }
  &__hero-balance {
    display: flex;
    align-items: baseline;
    gap: 6rpx;
    margin-bottom: $spacing-lg;
  }
  &__hero-balance-val {
    font-size: 96rpx;
    font-weight: $font-weight-bold;
    color: #fff;
    line-height: 1;
    text-shadow: 0 4rpx 16rpx rgba(0, 0, 0, 0.12);
  }
  &__hero-balance-unit {
    font-size: $font-lg;
    color: rgba(255, 255, 255, 0.9);
    font-weight: $font-weight-medium;
  }
  &__hero-stats {
    display: flex;
    align-items: center;
    background: rgba(255, 255, 255, 0.16);
    border-radius: $radius-md;
    padding: $spacing-sm $spacing-md;
  }
  &__hero-stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  &__hero-stat-val {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: #fff;
    line-height: 1.2;
  }
  &__hero-stat-val--small {
    font-size: $font-base;
  }
  &__hero-stat-lbl {
    font-size: $font-xs;
    color: rgba(255, 255, 255, 0.85);
    margin-top: 2rpx;
  }
  &__hero-stat-divider {
    width: 1rpx;
    height: 40rpx;
    background: rgba(255, 255, 255, 0.3);
  }

  // 子节点
  &__sub {
    padding: $spacing-md $spacing-lg;
    background: $bg-page;
    position: relative;
    z-index: 2;
    margin-top: -$spacing-md;
  }

  // 最近流水 section
  &__recent {
    background: $bg-page;
    padding: 0 $spacing-lg $spacing-xl;
  }
  &__recent-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: $spacing-md 0;
  }
  &__recent-title {
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }
  &__recent-more {
    font-size: $font-sm;
    color: $primary;
  }

  // 骨架
  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }
  &__skeleton-row {
    height: 120rpx;
    background: linear-gradient(90deg, $divider-light 0%, #f8f4ee 50%, $divider-light 100%);
    background-size: 200% 100%;
    border-radius: $radius-md;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  // 空
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-xl $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__empty-emoji {
    font-size: 96rpx;
    margin-bottom: $spacing-sm;
  }
  &__empty-title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__empty-desc {
    font-size: $font-sm;
    color: $text-secondary;
  }

  // 列表
  &__list {
    display: flex;
    flex-direction: column;
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-xs 0;
    box-shadow: $shadow-card;
  }

  // 单行
  &__row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    padding: $spacing-md;
    border-bottom: 1rpx solid $divider-light;
    transition: background $transition-fast;
    &:active {
      background: $divider-light;
    }
    &:last-child {
      border-bottom: none;
    }
  }
  &__row-emoji {
    flex-shrink: 0;
    font-size: 48rpx;
    width: 64rpx;
    height: 64rpx;
    line-height: 64rpx;
    text-align: center;
    background: $bg-page;
    border-radius: $radius-pill;
  }
  &__row-body {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  &__row-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.4;
    @include multi-ellipsis(1);
  }
  &__row-sub {
    display: block;
    font-size: $font-xs;
    color: $text-tertiary;
    line-height: 1.4;
    margin-top: 4rpx;
    @include multi-ellipsis(1);
  }
  &__row-amount-wrap {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4rpx;
  }
  &__row-amount {
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    line-height: 1;
  }
  &__row-amount--in {
    color: $accent;
  }
  &__row-amount--out {
    color: #FF6B6B;
  }
  &__row-amount--neutral {
    color: $text-secondary;
  }
  &__row-time {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__bottom-hint {
    text-align: center;
    font-size: $font-xs;
    color: $text-tertiary;
    padding: $spacing-md 0;
  }
  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>
