<!--
  我的订单 - C 端家长视角 (2026-07-05 重构: 全 kid 跨 org 聚合 + 顶部筛选 chip)
  数据源: R-2078 GET /orders/me (强制 activeStudent → 跨 kid 聚合)
  字段 (service.listMyOrdersForGuardian 已 populate):
    student.{name, org.{name}}    — 孩子 + 所属机构
    items[].courseProduct.{name, totalLessons, ...}
    orderNo / actualPrice / paidAmount / status / refundedAmount / createdAt
  状态: pending / paid / partially_refunded / refunded / cancelled

  新增筛选 (顶部一行横向 chip):
    - 状态: 全部 / 待支付 / 已支付 / 部分退款 / 已退款 / 已取消
    - 机构: 全部 + 当前数据中出现过的机构 (kidMap.orgIds + org.name)
    - 学生: 全部 + 当前用户的 kid 列表 (kidMap)
-->
<template>
  <view class="ol">
    <!-- 顶部: 当前用户的所有订单 + 顶行 3 栏筛选 chip 区 -->
    <view class="ol__head">
      <view class="ol__head-title">
        <text class="ol__head-title-text">我的全部订单</text>
        <text class="ol__head-title-meta">{{ total }} 笔</text>
      </view>
    </view>

    <!-- 列表 -->
    <scroll-view
      scroll-y
      class="ol__scroll"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onPullDown"
      @scrolltolower="onLower"
    >
      <view v-if="loading && !items.length" class="ol__skeleton-list">
        <view v-for="i in 3" :key="i" class="ol__skeleton-card" />
      </view>

      <view v-else-if="!loading && !items.length" class="ol__empty">
        <text class="ol__empty-emoji">🧾</text>
        <text class="ol__empty-title">{{ emptyTitle }}</text>
        <text class="ol__empty-desc">{{ emptyDesc }}</text>
      </view>

      <view v-else class="ol__list">
        <view
          v-for="o in items"
          :key="o._id"
          class="ol__card press"
          @tap="goDetail(o)"
        >
          <!-- 卡片头: 所属机构 + 学生 (用 emoji + 文本区分两种归属) -->
          <view class="ol__card-meta">
            <text class="ol__card-meta-org">🏫 {{ orgName(o) }}</text>
            <text class="ol__card-meta-dot">·</text>
            <text class="ol__card-meta-kid">👦 {{ studentName(o) }}</text>
          </view>

          <!-- 状态行: 订单号 + 状态 tag -->
          <view class="ol__card-head">
            <text class="ol__card-no">订单号 {{ shortOrderNo(o.orderNo || o._id) }}</text>
            <text class="ol__card-status" :class="`ol__card-status--${o.status}`">
              {{ statusLabel(o.status) }}
            </text>
          </view>

          <!-- 课程项 -->
          <view class="ol__card-courses">
            <view
              v-for="(item, idx) in (o.items || []).slice(0, 2)"
              :key="idx"
              class="ol__card-course"
            >
              <text class="ol__card-course-name">{{ item.courseProduct?.name || '课程' }}</text>
              <view class="ol__card-course-meta">
                <text v-if="item.courseProduct?.totalLessons">{{ item.courseProduct.totalLessons }} 课时</text>
                <text v-if="item.quantity && item.quantity > 1" class="ol__card-course-meta-x">× {{ item.quantity }}</text>
              </view>
            </view>
            <view v-if="(o.items || []).length > 2" class="ol__card-more">
              还有 {{ o.items.length - 2 }} 门课程 ›
            </view>
          </view>

          <view class="ol__card-foot">
            <view class="ol__card-price-wrap">
              <text class="ol__card-price-cur">¥</text>
              <text class="ol__card-price-val">{{ formatPrice(o) }}</text>
              <text v-if="o.refundedAmount && o.refundedAmount > 0" class="ol__card-refunded">
                已退 ¥{{ formatNum(o.refundedAmount) }}
              </text>
            </view>
            <text class="ol__card-time">{{ createdAtLabel(o) }}</text>
          </view>
        </view>

        <view class="ol__bottom">
          <text v-if="loadingMore" class="ol__bottom-text">加载中...</text>
          <text v-else-if="finished" class="ol__bottom-text">— 没有更多了 —</text>
          <text v-else class="ol__bottom-text ol__bottom-text--more press" @tap="loadMore">
            点击加载更多
          </text>
        </view>
      </view>

      <view class="ol__bottom-spacer" />
    </scroll-view>
  </view>
</template>

<script>
import { orderApi } from '@/api/order'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'

const STATUS_META = {
  pending: { label: '待支付' },
  paid: { label: '已支付' },
  partially_refunded: { label: '部分退款' },
  refunded: { label: '已退款' },
  cancelled: { label: '已取消' }
}

export default {
  data() {
    return {
      loading: false,
      loadingMore: false,
      refreshing: false,
      finished: false,
      items: [],
      page: 1,
      pageSize: 20,
      total: 0
    }
  },
  computed: {
    emptyTitle() {
      return '还没有订单'
    },
    emptyDesc() {
      return '报名课程后,订单会出现在这里 ›'
    }
  },
  onShow() {
    this.resetAndLoad()
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
    async loadMore() {
      if (this.finished || this.loadingMore || this.loading) return
      const next = this.page + 1
      await this.loadPage(next, true)
    },
    onPullDown() {
      this.refresh().finally(() => uni.stopPullDownRefresh())
    },

    // scroll-view 触底加载 (模板 @scrolltolower="onLower")
    onLower() {
      if (this.finished || this.loadingMore || this.loading) return
      this.loadMore()
    },

    async refresh() {
      await this.resetAndLoad()
    },

    async loadPage(targetPage, append) {
      // 2026-07-05: 用户撤掉筛选 chip — 只拉所有订单, 不传 status / student
      const params = { page: targetPage, pageSize: this.pageSize }
      append ? (this.loadingMore = true) : (this.loading = true)
      try {
        const res = await orderApi.me(params)
        const list = res?.items || []
        const mapped = list.map((o) => ({ ...o, _id: o._id || o.id }))
        this.items = append ? [...this.items, ...mapped] : mapped
        this.total = res?.total || 0
        this.page = targetPage
        if (this.items.length >= this.total || mapped.length < this.pageSize) {
          this.finished = true
        }
      } catch (e) {
        // 真实错误反馈到 toast 而非静音 console
        uni.showToast({ title: '订单加载失败,请稍后再试', icon: 'none' })
        if (!append) this.items = []
        this.finished = true
      } finally {
        this.loading = false
        this.loadingMore = false
      }
    },
    statusLabel(s) {
      return (STATUS_META[s] && STATUS_META[s].label) || s || '未知'
    },
    formatPrice(o) {
      const v = Number(o.paidAmount || o.actualPrice || 0)
      return v.toFixed(2)
    },
    formatNum(n) {
      return (Number(n) || 0).toFixed(2)
    },
    shortOrderNo(id) {
      if (!id) return ''
      const s = String(id)
      return s.length > 8 ? s.slice(-8).toUpperCase() : s.toUpperCase()
    },
    // 机构名 (后端已 populate student.org.name)
    orgName(o) {
      const sOrg = o.student && o.student.org
      if (sOrg && typeof sOrg === 'object' && sOrg.name) return sOrg.name
      return '—'
    },
    studentName(o) {
      if (o.student && o.student.name) return o.student.name
      return '—'
    },
    // 模板 {{ createdAtLabel(o) }} — options API 不认 module-scope 的 date util
    createdAtLabel(o) {
      if (!o || !o.createdAt) return ''
      return date.fmtShort(o.createdAt)
    },
    goDetail(o) {
      if (!o || !o._id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/order/detail?id=${o._id}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.ol {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);

  // 顶部 head: 标题 + 3 行 chip
  &__head {
    padding: $spacing-md $spacing-lg $spacing-sm;
    background: linear-gradient(180deg, $primary-bg 0%, $bg-page 100%);
  }
  &__head-title {
    display: flex;
    align-items: baseline;
    gap: $spacing-xs;
    margin-bottom: $spacing-sm;
  }
  &__head-title-text {
    font-size: $font-md;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }
  &__head-title-meta {
    font-size: $font-xs;
    color: $text-tertiary;
  }
  // 2026-07-05: 撤掉 3 行 chip (用户原话「应该不会太多 吵不过几十个,筛选就不需要了」) — SCSS 同步删

  // 滚动
  &__scroll {
    flex: 1;
    height: 0;
  }

  &__skeleton-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
    padding: $spacing-sm $spacing-lg;
  }
  &__skeleton-card {
    height: 220rpx;
    background: linear-gradient(90deg, $divider-light 0%, #f8f4ee 50%, $divider-light 100%);
    background-size: 200% 100%;
    border-radius: $radius-md;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  // 空态
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl $spacing-md;
    margin: $spacing-md $spacing-lg;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    text-align: center;
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
    padding: 0 $spacing-lg $spacing-md;
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }

  &__card {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    transition: all $transition-fast;
    &:active {
      transform: scale(0.98);
    }
  }

  // 卡片 meta (机构 + 学生) — 显示在头部最显眼位置
  &__card-meta {
    display: flex;
    align-items: center;
    gap: 6rpx;
    margin-bottom: $spacing-xs;
    font-size: $font-xs;
    color: $text-secondary;
    flex-wrap: wrap;
  }
  &__card-meta-org {
    color: $primary-dark;
    font-weight: $font-weight-semibold;
    @include multi-ellipsis(1);
    max-width: 50%;
  }
  &__card-meta-dot {
    color: $text-tertiary;
  }
  &__card-meta-kid {
    @include multi-ellipsis(1);
    max-width: 40%;
  }

  // 头: 订单号 + 状态
  &__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
    margin-bottom: $spacing-sm;
  }
  &__card-no {
    font-size: $font-xs;
    color: $text-tertiary;
    font-family: monospace;
    @include multi-ellipsis(1);
    flex: 1;
  }
  &__card-status {
    flex-shrink: 0;
    font-size: $font-xs;
    padding: 4rpx 14rpx;
    border-radius: $radius-pill;
    font-weight: $font-weight-medium;
    &--pending {
      color: $warning;
      background: $warning-light;
    }
    &--paid {
      color: $accent;
      background: $accent-light;
    }
    &--partially_refunded {
      color: $info;
      background: rgba(91, 158, 230, 0.12);
    }
    &--refunded,
    &--cancelled {
      color: $text-tertiary;
      background: $divider-light;
    }
  }

  // 课程区
  &__card-courses {
    padding: $spacing-sm 0;
    border-top: 1rpx solid $divider-light;
    border-bottom: 1rpx solid $divider-light;
    margin-bottom: $spacing-sm;
  }
  &__card-course {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6rpx 0;
    gap: $spacing-sm;
    &:last-child {
      padding-bottom: 0;
    }
  }
  &__card-course-name {
    flex: 1;
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
    @include multi-ellipsis(1);
  }
  &__card-course-meta {
    flex-shrink: 0;
    font-size: $font-xs;
    color: $text-tertiary;
    display: flex;
    gap: $spacing-xs;
  }
  &__card-course-meta-x {
    color: $primary;
    font-weight: $font-weight-semibold;
  }
  &__card-more {
    display: block;
    text-align: center;
    font-size: $font-xs;
    color: $primary;
    padding: $spacing-xs 0 0;
  }

  &__card-foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: $spacing-sm;
  }
  &__card-price-wrap {
    display: flex;
    align-items: baseline;
    gap: 2rpx;
    flex-wrap: wrap;
  }
  &__card-price-cur {
    font-size: $font-sm;
    color: $primary;
    font-weight: $font-weight-semibold;
  }
  &__card-price-val {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1;
  }
  &__card-refunded {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-left: $spacing-xs;
  }
  &__card-time {
    font-size: $font-xs;
    color: $text-tertiary;
    text-align: right;
    flex-shrink: 0;
  }

  &__bottom {
    text-align: center;
    padding: $spacing-lg 0;
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
