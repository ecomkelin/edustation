<!--
  我的课包 - C 端家长视角
  数据源: R-2079 GET /student-products/me (强制 activeStudent)
  字段 (service.list 已 populate):
    courseProduct.{name, totalLessons, validDays}
    order.{_id, status, paidAmount} (仅 source=order)
    giftedBy.{realName, mobile}     (仅 source=gift)
    giftReason / totalLessons / remainingLessons / expireDate / isActive / source / createdAt
-->
<template>
  <view class="sp">
    <!-- 汇总头 -->
    <view class="sp__hero">
      <view class="sp__hero-bg" />
      <view class="sp__hero-inner">
        <text class="sp__hero-label">{{ activeStudentName }}的课包</text>
        <view class="sp__hero-row">
          <view class="sp__hero-num">
            <text class="sp__hero-num-val">{{ summary.totalRemaining }}</text>
            <text class="sp__hero-num-unit">节</text>
          </view>
          <view class="sp__hero-stat">
            <text class="sp__hero-stat-val">{{ summary.activeCount }}</text>
            <text class="sp__hero-stat-lbl">可用课包</text>
          </view>
          <view class="sp__hero-stat">
            <text class="sp__hero-stat-val">{{ summary.expiringSoon }}</text>
            <text class="sp__hero-stat-lbl">7天内到期</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 当前孩子切换 (单孩子不显示下拉箭头) -->
    <view class="sp__sub">
      <active-student-header @change="onStudentChange" />
    </view>

    <!-- 列表 -->
    <scroll-view
      scroll-y
      class="sp__scroll"
      :refresher-enabled="true"
      :refresher-triggered="refreshing"
      @refresherrefresh="onPullDown"
    >
      <view class="sp__list-inner">
        <!-- 加载中 -->
        <view v-if="loading && !items.length" class="sp__skeleton">
          <view v-for="i in 3" :key="i" class="sp__skeleton-card" />
        </view>

        <!-- 空状态 -->
        <view v-else-if="!loading && !items.length" class="sp__empty press" @tap="goCourses">
          <text class="sp__empty-emoji">🎒</text>
          <text class="sp__empty-title">还没有课包</text>
          <text class="sp__empty-desc">去发现适合孩子的课程 ›</text>
        </view>

        <!-- 卡片列表 -->
        <view v-else class="sp__list">
          <view
            v-for="sp in items"
            :key="sp._id"
            class="sp__card press"
            :class="{ 'sp__card--inactive': !sp.isActive }"
            @tap="goDetail(sp)"
          >
            <!-- 卡片头: 课程产品名 + 来源标签 -->
            <view class="sp__card-head">
              <text class="sp__card-name">{{ sp.courseProduct?.name || '课程' }}</text>
              <text class="sp__card-source" :class="`sp__card-source--${sp.source}`">
                {{ sourceLabel(sp) }}
              </text>
            </view>

            <!-- 进度条 -->
            <view class="sp__progress">
              <view class="sp__progress-bar">
                <view class="sp__progress-bar-fill" :style="{ width: percent(sp) + '%' }" />
              </view>
              <text class="sp__progress-text">
                剩余 <text class="sp__progress-text-em">{{ sp.remainingLessons }}</text>
                / {{ sp.totalLessons }} 节
              </text>
            </view>

            <!-- 元数据 -->
            <view class="sp__meta">
              <view class="sp__meta-item">
                <text class="sp__meta-icon">📅</text>
                <text class="sp__meta-text">到期 {{ formatDate(sp.expireDate) }}</text>
              </view>
              <view v-if="sp.courseProduct?.validDays" class="sp__meta-item">
                <text class="sp__meta-icon">⏳</text>
                <text class="sp__meta-text">自购入起 {{ sp.courseProduct.validDays }} 天</text>
              </view>
              <view v-if="sp.source === 'gift' && sp.giftedBy?.realName" class="sp__meta-item">
                <text class="sp__meta-icon">🎁</text>
                <text class="sp__meta-text">由 {{ sp.giftedBy.realName }} 赠送</text>
              </view>
              <view v-if="sp.source === 'gift' && sp.giftReason" class="sp__meta-item sp__meta-item--reason">
                <text class="sp__meta-icon">💡</text>
                <text class="sp__meta-text">原因: {{ sp.giftReason }}</text>
              </view>
              <view v-if="sp.source === 'order' && sp.order" class="sp__meta-item">
                <text class="sp__meta-icon">🧾</text>
                <text class="sp__meta-text">来源订单 {{ shortOrderId(sp.order) }}</text>
              </view>
            </view>

            <!-- 标签栏 -->
            <view class="sp__tags">
              <text v-if="isExpired(sp)" class="sp__tag sp__tag--warn">已过期</text>
              <text v-else-if="expiringDays(sp) <= 7" class="sp__tag sp__tag--warn">
                {{ expiringDays(sp) }}天后到期
              </text>
              <text v-if="sp.isActive === false" class="sp__tag sp__tag--ghost">已停用</text>
              <text v-if="sp.remainingLessons === 0" class="sp__tag sp__tag--ghost">已用完</text>
              <text v-else-if="percent(sp) <= 20" class="sp__tag sp__tag--info">余量紧张</text>
            </view>
          </view>
        </view>

        <view class="sp__bottom-spacer" />
      </view>
    </scroll-view>

    <!-- 底部悬浮: 去买课 (用于空状态引导之外的快速入口) -->
    <view v-if="items.length" class="sp__fab press" @tap="goCourses">
      <text>+ 去买课</text>
    </view>
  </view>
</template>

<script>
import { mapState, mapGetters } from 'pinia'
import { useStudentStore } from '@/stores/student'
import ActiveStudentHeader from '@/components/layout/ActiveStudentHeader.vue'
import { studentProductApi } from '@/api/studentProduct'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'

export default {
  components: { ActiveStudentHeader },
  data() {
    return {
      loading: false,
      refreshing: false,
      items: []
    }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId', 'list']),
    activeStudentName() {
      const s = (this.list || []).find((x) => String(x.id) === String(this.activeStudentId))
      return s?.name || '当前孩子'
    },
    summary() {
      const active = this.items.filter((x) => x.isActive !== false)
      const totalRemaining = active.reduce((s, x) => s + (x.remainingLessons || 0), 0)
      const expiringSoon = active.filter((x) => {
        const d = this.expiringDays(x)
        return d >= 0 && d <= 7
      }).length
      return {
        totalRemaining,
        activeCount: active.length,
        expiringSoon
      }
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
        const res = await studentProductApi.me({})
        // [memory: http-interceptor-actually-unpacked] http 已解包, res 即业务字段
        const list = Array.isArray(res) ? res : res?.items || res?.data || []
        this.items = list.map((x) => ({ ...x, _id: x._id || x.id }))
      } catch (e) {
        console.warn('[studentProduct.list]', e)
        this.items = []
      } finally {
        this.loading = false
      }
    },
    async onPullDown() {
      this.refreshing = true
      await this.load()
      this.refreshing = false
    },
    onStudentChange() {
      this.load()
    },
    percent(sp) {
      const t = sp.totalLessons || 0
      if (t <= 0) return 0
      return Math.max(0, Math.min(100, Math.round((sp.remainingLessons / t) * 100)))
    },
    // 过期天数 (>=0 未过期, 负数已过期)
    expiringDays(sp) {
      if (!sp.expireDate) return 9999
      const diff = new Date(sp.expireDate).getTime() - Date.now()
      return Math.floor(diff / (1000 * 60 * 60 * 24))
    },
    isExpired(sp) {
      return this.expiringDays(sp) < 0
    },
    formatDate(d) {
      if (!d) return '—'
      return date.fmtDate(d)
    },
    shortOrderId(order) {
      const id = typeof order === 'string' ? order : order?._id
      if (!id) return ''
      const s = String(id)
      return s.length > 8 ? s.slice(-8).toUpperCase() : s.toUpperCase()
    },
    sourceLabel(sp) {
      if (sp.source === 'gift') return '赠课'
      if (sp.source === 'order') return '购买'
      return sp.source || '其他'
    },
    goDetail(sp) {
      // 暂不进入详情页 (C 端没有专门的详情端点), 给个轻提示
      haptic.tap()
      uni.showToast({ title: `${sp.courseProduct?.name || '课包'} · ${sp.remainingLessons}/${sp.totalLessons}`, icon: 'none' })
    },
    goCourses() {
      haptic.tap()
      uni.switchTab({ url: '/pages/tabbar/explore' })
    }
  }
}
</script>

<style lang="scss" scoped>
.sp {
  min-height: 100vh;
  background: $bg-page;
  display: flex;
  flex-direction: column;
  padding-bottom: env(safe-area-inset-bottom);

  // 顶部 hero: 总剩余/可用课包/7天内到期
  &__hero {
    position: relative;
    overflow: hidden;
    padding: $spacing-md 0 $spacing-lg;
  }
  &__hero-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, $primary-lighter 0%, #FFE4D3 60%, $bg-page 100%);
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
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }
  &__hero-row {
    display: flex;
    align-items: flex-end;
    gap: $spacing-md;
  }
  &__hero-num {
    display: flex;
    align-items: baseline;
    gap: 4rpx;
    flex: 1;
  }
  &__hero-num-val {
    font-size: 72rpx;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1;
  }
  &__hero-num-unit {
    font-size: $font-base;
    color: $text-secondary;
  }
  &__hero-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 120rpx;
  }
  &__hero-stat-val {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.2;
  }
  &__hero-stat-lbl {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 2rpx;
  }

  // 学生切换 (放在 hero 之后, 在列表之前)
  &__sub {
    padding: $spacing-sm $spacing-lg $spacing-md;
    background: $bg-page;
    position: relative;
    z-index: 2;
  }

  // 滚动区
  &__scroll {
    flex: 1;
    height: 0;
  }
  &__list-inner {
    padding: 0 $spacing-lg $spacing-xl;
  }

  // 骨架
  &__skeleton {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }
  &__skeleton-card {
    height: 220rpx;
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
    margin-top: $spacing-md;
  }
  &__empty-emoji { font-size: 96rpx; margin-bottom: $spacing-sm; }
  &__empty-title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__empty-desc {
    font-size: $font-sm;
    color: $primary;
  }

  // 列表
  &__list {
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }

  // 卡片
  &__card {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    position: relative;
    overflow: hidden;
    transition: all $transition-fast;
    &:active {
      transform: scale(0.99);
    }
    &--inactive {
      opacity: 0.55;
    }
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 8rpx;
      background: $primary;
    }
    &--inactive::before {
      background: $text-tertiary;
    }
  }
  &__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: $spacing-sm;
    margin-bottom: $spacing-md;
  }
  &__card-name {
    flex: 1;
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.3;
    @include multi-ellipsis(1);
  }
  &__card-source {
    flex-shrink: 0;
    font-size: $font-xs;
    padding: 4rpx 12rpx;
    border-radius: $radius-pill;
    font-weight: $font-weight-medium;
    &--order {
      color: $primary-dark;
      background: $primary-lighter;
    }
    &--gift {
      color: #B45309;
      background: #FEF3C7;
    }
  }

  // 进度
  &__progress {
    margin-bottom: $spacing-md;
  }
  &__progress-bar {
    height: 16rpx;
    background: $divider-light;
    border-radius: $radius-pill;
    overflow: hidden;
    margin-bottom: $spacing-xs;
  }
  &__progress-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, $primary, $primary-light);
    border-radius: $radius-pill;
    transition: width 0.3s ease;
  }
  &__progress-text {
    font-size: $font-xs;
    color: $text-secondary;
  }
  &__progress-text-em {
    color: $primary;
    font-weight: $font-weight-bold;
    font-size: $font-sm;
  }

  // meta
  &__meta {
    display: flex;
    flex-direction: column;
    gap: 6rpx;
    margin-bottom: $spacing-sm;
  }
  &__meta-item {
    display: flex;
    align-items: center;
    gap: 6rpx;
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.4;
  }
  &__meta-item--reason {
    color: #92400E;
  }
  &__meta-icon {
    flex-shrink: 0;
    font-size: $font-sm;
  }

  // tags
  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8rpx;
  }
  &__tag {
    font-size: $font-xs;
    padding: 2rpx 12rpx;
    border-radius: $radius-pill;
    line-height: 1.6;
    &--warn {
      color: #fff;
      background: $warning;
    }
    &--ghost {
      color: $text-tertiary;
      background: $divider-light;
    }
    &--info {
      color: $primary-dark;
      background: $primary-lighter;
    }
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }

  // 悬浮按钮
  &__fab {
    position: fixed;
    right: $spacing-lg;
    bottom: calc(#{$spacing-xl} + env(safe-area-inset-bottom));
    padding: 18rpx 28rpx;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    font-size: $font-sm;
    font-weight: $font-weight-semibold;
    box-shadow: $shadow-button;
    z-index: 10;
    &:active {
      transform: scale(0.96);
    }
  }
}
</style>
