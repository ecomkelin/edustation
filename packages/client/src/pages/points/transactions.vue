<!--
  积分流水 - C 端家长视角
  数据源: R-2000 GET /points/transactions?page=&pageSize=30
  返回: { items, total, page, pageSize }
  字段 (service.transactions 已 populate):
    reason.{name, meta}
    operator.{realName, mobile}
    amount / trigger / balanceAfter / remark / createdAt / refType / refId
-->
<template>
  <view class="pt">
    <!-- 顶部统计 summary (今日入账/出账 + 累计笔数) -->
    <view v-if="summary.show" class="pt__summary">
      <view class="pt__summary-block">
        <text class="pt__summary-val pt__summary-val--in">+{{ summary.todayIn }}</text>
        <text class="pt__summary-lbl">今日入账</text>
      </view>
      <view class="pt__summary-divider" />
      <view class="pt__summary-block">
        <text class="pt__summary-val pt__summary-val--out">-{{ summary.todayOut }}</text>
        <text class="pt__summary-lbl">今日支出</text>
      </view>
      <view class="pt__summary-divider" />
      <view class="pt__summary-block">
        <text class="pt__summary-val">{{ total }}</text>
        <text class="pt__summary-lbl">累计笔数</text>
      </view>
    </view>

    <view v-if="loading && !items.length" class="pt__skeleton">
      <view v-for="i in 6" :key="i" class="pt__skeleton-row" />
    </view>

    <view v-else-if="!items.length" class="pt__empty">
      <text class="pt__empty-emoji">📜</text>
      <text class="pt__empty-title">还没有积分流水</text>
      <text class="pt__empty-desc">连续出勤 / 分享课程 / 兑换宠物食物都能赚积分</text>
    </view>

    <view v-else>
      <view v-for="group in grouped" :key="group.date" class="pt__group">
        <view class="pt__group-head">
          <text class="pt__group-date">{{ group.label }}</text>
          <view class="pt__group-stats">
            <text v-if="group.inCount" class="pt__group-stat pt__group-stat--in">
              +{{ group.inTotal }}
            </text>
            <text v-if="group.outCount" class="pt__group-stat pt__group-stat--out">
              -{{ group.outTotal }}
            </text>
          </view>
        </view>

        <view class="pt__list">
          <view
            v-for="(tx, idx) in group.items"
            :key="tx._id"
            class="pt__row"
          >
            <!-- 时间轴左侧 -->
            <view class="pt__row-axis">
              <view class="pt__row-dot" :class="`pt__row-dot--${dotClass(tx)}`">
                <text class="pt__row-emoji">{{ triggerMeta(tx.trigger).emoji }}</text>
              </view>
              <view v-if="idx < group.items.length - 1" class="pt__row-line" />
            </view>

            <view class="pt__row-body">
              <view class="pt__row-head">
                <text class="pt__row-title">{{ txTitle(tx) }}</text>
                <text class="pt__row-amount" :class="amountClass(tx)">
                  {{ tx.amount > 0 ? '+' : '' }}{{ tx.amount }}
                </text>
              </view>
              <view class="pt__row-meta">
                <text v-if="tx.remark" class="pt__row-meta-text">{{ tx.remark }}</text>
                <text v-if="tx.operator && tx.operator.realName" class="pt__row-meta-text">
                  {{ tx.remark ? ' · ' : '' }}{{ tx.operator.realName }}
                </text>
              </view>
              <view class="pt__row-foot">
                <text class="pt__row-time">{{ timeLabel(tx) }}</text>
                <text class="pt__row-balance">余额 {{ tx.balanceAfter }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <!-- 加载状态/底部 -->
      <view class="pt__bottom">
        <text v-if="loading" class="pt__bottom-text">加载中...</text>
        <text v-else-if="finished" class="pt__bottom-text">— 没有更多了 —</text>
        <text v-else @tap="loadMore" class="pt__bottom-text pt__bottom-text--more press">
          点击加载更多
        </text>
      </view>
    </view>

    <view class="pt__bottom-spacer" />
  </view>
</template>

<script>
import { mapState } from 'pinia'
import { useStudentStore } from '@/stores/student'
import { pointsApi } from '@/api/points'
import { date } from '@/utils/date'

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

function sameDay(d1, d2) {
  const a = new Date(d1)
  const b = new Date(d2)
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

export default {
  data() {
    return {
      loading: false,
      loadingMore: false,
      items: [],
      total: 0,
      page: 1,
      pageSize: 30,
      finished: false
    }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId', 'list']),
    activeStudentName() {
      const s = (this.list || []).find((x) => String(x.id) === String(this.activeStudentId))
      return s?.name || '当前孩子'
    },
    grouped() {
      // 按 createdAt 的 YYYY-MM-DD 分组, 同日内按时间倒序已由后端保证
      const groups = []
      const idxMap = new Map()
      this.items.forEach((tx) => {
        const key = date.fmtDate(tx.createdAt)
        if (!idxMap.has(key)) {
          idxMap.set(key, groups.length)
          groups.push({
            date: key,
            label: this.labelFor(key),
            items: [],
            inCount: 0,
            outCount: 0,
            inTotal: 0,
            outTotal: 0
          })
        }
        const g = groups[idxMap.get(key)]
        g.items.push(tx)
        const dir = TRIGGER_META[tx.trigger]?.dir
        if (dir === 'in') {
          g.inCount++
          g.inTotal += tx.amount
        } else if (dir === 'out') {
          g.outCount++
          g.outTotal += -tx.amount
        }
      })
      return groups
    },
    summary() {
      const todayKey = date.fmtDate(Date.now())
      let todayIn = 0
      let todayOut = 0
      this.items.forEach((tx) => {
        if (date.fmtDate(tx.createdAt) !== todayKey) return
        const dir = TRIGGER_META[tx.trigger]?.dir
        if (dir === 'in') todayIn += tx.amount
        else if (dir === 'out') todayOut += -tx.amount
      })
      return { todayIn, todayOut, show: true }
    }
  },
  watch: {
    activeStudentId() {
      this.resetAndLoad()
    }
  },
  onShow() {
    // 每次回到页面都刷新第一页, 防止其它地方扣分后看陈旧数据
    this.resetAndLoad()
  },
  onPullDownRefresh() {
    this.refresh().finally(() => {
      uni.stopPullDownRefresh()
    })
  },
  onReachBottom() {
    if (this.finished || this.loadingMore || this.loading) return
    this.loadMore()
  },
  methods: {
    async resetAndLoad() {
      this.items = []
      this.page = 1
      this.finished = false
      await this.loadPage(1, false)
    },
    async refresh() {
      await this.resetAndLoad()
    },
    async loadMore() {
      if (this.finished || this.loadingMore || this.loading) return
      const next = this.page + 1
      await this.loadPage(next, true)
    },
    async loadPage(targetPage, append) {
      append ? (this.loadingMore = true) : (this.loading = true)
      try {
        const res = await pointsApi.transactions({
          page: targetPage,
          pageSize: this.pageSize
        })
        const list = res?.items || []
        const mapped = list.map((x) => ({ ...x, _id: x._id || x.id }))
        this.items = append ? [...this.items, ...mapped] : mapped
        this.total = res?.total || 0
        this.page = targetPage
        // 判断是否到底
        if (this.items.length >= this.total || mapped.length < this.pageSize) {
          this.finished = true
        }
      } catch (e) {
        console.warn('[points.transactions]', e)
        if (!append) {
          this.items = []
          this.total = 0
        }
        this.finished = true
      } finally {
        this.loading = false
        this.loadingMore = false
      }
    },
    labelFor(dateKey) {
      // dateKey: 'YYYY-MM-DD'
      if (!dateKey) return ''
      const todayKey = date.fmtDate(Date.now())
      const yesterdayMs = Date.now() - 24 * 60 * 60 * 1000
      const yesterdayKey = date.fmtDate(yesterdayMs)
      if (dateKey === todayKey) return '今天'
      if (dateKey === yesterdayKey) return '昨天'
      return dateKey
    },
    triggerMeta(trigger) {
      return TRIGGER_META[trigger] || { label: trigger || '其他', emoji: '💫', dir: 'neutral' }
    },
    txTitle(tx) {
      if (tx.reason && tx.reason.name) return tx.reason.name
      return this.triggerMeta(tx.trigger).label
    },
    dotClass(tx) {
      const dir = this.triggerMeta(tx.trigger).dir
      if (dir === 'in') return 'in'
      if (dir === 'out') return 'out'
      return 'neutral'
    },
    // 模板 {{ timeLabel(tx) }} — options API 模板不认 module-scope util
    timeLabel(tx) {
      if (!tx || !tx.createdAt) return ''
      return date.fmtTime(tx.createdAt)
    },

    amountClass(tx) {
      const dir = this.triggerMeta(tx.trigger).dir
      if (dir === 'in') return 'pt__row-amount--in'
      if (dir === 'out') return 'pt__row-amount--out'
      return 'pt__row-amount--neutral'
    }
  }
}
</script>

<style lang="scss" scoped>
.pt {
  min-height: 100vh;
  background: $bg-page;
  padding-bottom: env(safe-area-inset-bottom);

  // 顶部 summary
  &__summary {
    display: flex;
    align-items: center;
    background: $bg-card;
    margin: $spacing-md $spacing-lg;
    border-radius: $radius-md;
    padding: $spacing-md $spacing-sm;
    box-shadow: $shadow-card;
  }
  &__summary-block {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
  }
  &__summary-val {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.2;
    &--in {
      color: $accent;
    }
    &--out {
      color: #FF6B6B;
    }
  }
  &__summary-lbl {
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__summary-divider {
    width: 1rpx;
    height: 56rpx;
    background: $divider-light;
  }

  // 骨架
  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    padding: 0 $spacing-lg;
  }
  &__skeleton-row {
    height: 140rpx;
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
    margin: $spacing-md $spacing-lg;
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

  // 分组
  &__group {
    padding: 0 $spacing-lg $spacing-md;
  }
  &__group-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    padding: $spacing-md 0 $spacing-sm;
  }
  &__group-date {
    font-size: $font-base;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }
  &__group-stats {
    display: flex;
    gap: $spacing-sm;
  }
  &__group-stat {
    font-size: $font-sm;
    font-weight: $font-weight-semibold;
    &--in {
      color: $accent;
    }
    &--out {
      color: #FF6B6B;
    }
  }

  // 列表卡
  &__list {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-xs 0;
    box-shadow: $shadow-card;
  }

  // 行
  &__row {
    display: flex;
    gap: $spacing-sm;
    padding: $spacing-md;
  }
  &__row-axis {
    position: relative;
    flex-shrink: 0;
    width: 56rpx;
    display: flex;
    justify-content: center;
    padding-top: 4rpx;
  }
  &__row-dot {
    width: 56rpx;
    height: 56rpx;
    line-height: 56rpx;
    text-align: center;
    border-radius: $radius-pill;
    z-index: 1;
    &--in {
      background: rgba(124, 217, 183, 0.18);
    }
    &--out {
      background: rgba(255, 107, 107, 0.16);
    }
    &--neutral {
      background: $divider-light;
    }
  }
  &__row-emoji {
    font-size: 32rpx;
    vertical-align: middle;
  }
  &__row-line {
    position: absolute;
    left: 50%;
    top: 60rpx;
    bottom: -32rpx;
    width: 2rpx;
    background: $divider-light;
    transform: translateX(-50%);
  }
  &__row-body {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  &__row-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: $spacing-sm;
    margin-bottom: 4rpx;
  }
  &__row-title {
    flex: 1;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.4;
    @include multi-ellipsis(1);
  }
  &__row-amount {
    flex-shrink: 0;
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    line-height: 1;
    &--in {
      color: $accent;
    }
    &--out {
      color: #FF6B6B;
    }
    &--neutral {
      color: $text-secondary;
    }
  }
  &__row-meta {
    margin-bottom: 6rpx;
  }
  &__row-meta-text {
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.5;
    @include multi-ellipsis(1);
  }
  &__row-foot {
    display: flex;
    justify-content: space-between;
    font-size: $font-xs;
    color: $text-tertiary;
  }

  // 底部状态
  &__bottom {
    text-align: center;
    padding: $spacing-lg 0 $spacing-md;
  }
  &__bottom-text {
    font-size: $font-xs;
    color: $text-tertiary;
    &--more {
      color: $primary;
      padding: $spacing-sm $spacing-lg;
    }
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>
