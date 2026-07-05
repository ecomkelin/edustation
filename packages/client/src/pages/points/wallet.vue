<!--
  我的积分 - C 端家长视角 (2026-07-05 重做)
  数据源: R-2072 GET /points/me?student=xxx  (后端 points.controller.js: student = req.query.student || req.activeStudentId, 允许 query 覆盖)
  显示指定 kid 的积分; 不切全局 activeStudent — 这是「查看模式」, kid-card 跳进来就是该 kid 的数据, 用户原话「这页面不许换孩子」
  入参: ?kid=<id> (必填)
  返回字段:
    balance / totalEarned / totalSpent / lastTransactionAt
    recentTransactions: [{ amount, trigger, reason{name}, operator{realName}, balanceAfter, remark, createdAt }]
-->
<template>
  <view class="pw">
    <!-- Hero -->
    <view class="pw__hero">
      <view class="pw__hero-bg" />
      <view class="pw__hero-inner">
        <text class="pw__hero-label">{{ viewStudentName }}的积分</text>
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

    <!-- 最近流水 -->
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
            <text class="pw__row-time">{{ timeLabel(tx) }}</text>
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
  data() {
    return {
      loading: false,
      // 2026-07-05: 入参 ?kid=xxx, 显示 view-kid 的积分 (不切 activeStudent)
      viewKidId: '',
      viewStudentName: '',
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
    // 仅用来反查 kid 名 (kidMap 在主屏 me.vue 已经 fetch)
    ...mapState(useStudentStore, ['list']),
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
  onLoad(query) {
    // uni-app x H5 下 onLoad 只在页面首次创建时跑一次, 后续 navigateTo 复用实例只触发 onShow
    // 所以 query 解析必须放 onShow, 每次进入重新读 — 否则 wallet 第二次进来仍是上次的 viewKidId
    this.viewKidId = (query && query.kid) || ''
    this._resolveViewName()
  },
  onShow() {
    // 每次显示重新读 query (H5 下 navigateTo 复用实例只跑 onShow)
    // 解码方式: uni.getCurrentPages() 看当前页面 options
    try {
      const pages = getCurrentPages && getCurrentPages()
      const cur = pages && pages.length ? pages[pages.length - 1] : null
      const options = (cur && cur.options) || {}
      // 优先读页面栈当前实例 options (uni-app x 实测拿到正确 query), 失败再用 data 里缓存的
      if (options && options.kid) {
        if (this.viewKidId !== options.kid) {
          this.viewKidId = options.kid
          this._resolveViewName()
        }
      }
    } catch (e) {
      console.warn('[wallet.onShow] getCurrentPages failed', e)
    }
    this.load()
  },
  methods: {
    _resolveViewName() {
      if (this.viewKidId && Array.isArray(this.list) && this.list.length) {
        const found = this.list.find((x) => String(x.id) === String(this.viewKidId))
        this.viewStudentName = (found && found.name) || '孩子'
      } else {
        this.viewStudentName = '孩子'
      }
    },
    async load() {
      console.log('[wallet.load] viewKidId=', this.viewKidId)
      if (!this.viewKidId) {
        this.recent = []
        this.account = { balance: 0, totalEarned: 0, totalSpent: 0, lastTransactionAt: null }
        return
      }
      this.loading = true
      try {
        // R-2072 后端 controller 接受 query.student 覆盖 activeStudentId
        const res = await pointsApi.me({ student: this.viewKidId })
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
        uni.showToast({ title: '积分加载失败,请稍后再试', icon: 'none' })
      } finally {
        this.loading = false
      }
    },
    triggerMeta(trigger) {
      return TRIGGER_META[trigger] || { label: trigger || '其他', emoji: '💫', dir: 'neutral' }
    },
    txTitle(tx) {
      if (tx.reason && tx.reason.name) return tx.reason.name
      return this.triggerMeta(tx.trigger).label
    },
    txSub(tx) {
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
    timeLabel(tx) {
      if (!tx || !tx.createdAt) return ''
      return date.fmtTime(tx.createdAt)
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
      // 看全部仍按 viewKid 过滤 (保持当前 kid 不动)
      const url = this.viewKidId
        ? `/pages/points/transactions?kid=${this.viewKidId}`
        : '/pages/points/transactions'
      uni.navigateTo({ url })
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

  &__hero {
    position: relative;
    overflow: hidden;
    padding: $spacing-lg 0 $spacing-xl;
  }
  &__hero-bg {
    position: absolute;
    inset: 0;
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

  &__recent {
    background: $bg-page;
    padding: 0 $spacing-md $spacing-xl;
  }
  &__recent-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
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

  &__list {
    display: flex;
    flex-direction: column;
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-xs 0;
    box-shadow: $shadow-card;
  }
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
