<!--
  全部课程 (C 端全量列表)
  2026-07-03: 由 PlaceholderPage 升级为真实列表, 复用 R-1214 /course-enrollments/me
  双 tab 已在 index.vue「我的课程&课包」模块简化时下线, 这里保留独立入口 (首页"全部课程"按钮跳入)
-->
<template>
  <view class="enroll-list">
    <!-- 顶部吸附: 状态 tab (全部 / 在读 / 已结业 / 已退班) -->
    <view class="enroll-list__tabs">
      <view
        v-for="t in tabList"
        :key="t.value"
        class="enroll-list__tab"
        :class="{ active: filter.status === t.value }"
        @tap="onChangeTab(t.value)"
      >
        <text>{{ t.label }} ({{ counts[t.value] }})</text>
      </view>
    </view>

    <scroll-view
      scroll-y
      class="enroll-list__scroll"
      @scrolltolower="onLower"
    >
      <view v-if="loading && !list.length" class="enroll-list__loading">
        <text>召唤中…</text>
      </view>

      <view v-else-if="!list.length" class="enroll-list__empty">
        <text class="enroll-list__empty-emoji">📋</text>
        <text class="enroll-list__empty-title">还没有报名记录</text>
        <text class="enroll-list__empty-desc">孩子报名课程后会显示在这里 ›</text>
      </view>

      <view v-else class="enroll-list__cards">
        <view
          v-for="e in list"
          :key="e._id"
          class="enroll-list__card press"
          @tap="goCourseDetail(e.courseInstance?._id || e.courseInstance)"
        >
          <view class="enroll-list__card-head">
            <text class="enroll-list__card-name">
              {{ e.courseInstance?.name || '课程' }}
            </text>
            <text
              class="enroll-list__card-tag"
              :class="['enroll-list__card-tag--' + (e.status || 'active')]"
            >
              {{ statusLabel(e.status) }}
            </text>
          </view>
          <view class="enroll-list__card-meta">
            <text>👨‍🏫 {{ e.courseInstance?.teacher?.realName || '老师待定' }}</text>
            <text>📍 {{ e.courseInstance?.room?.name || '教室待定' }}</text>
            <text>📅 报名 {{ formatDate(e.enrolledAt) }}</text>
          </view>
          <view class="enroll-list__card-progress">
            <view class="enroll-list__card-bar">
              <view
                class="enroll-list__card-bar-fill"
                :style="{ width: progressPct(e.progress && e.progress.attendedLessons, e.progress && e.progress.totalLessons) }"
              />
            </view>
            <text class="enroll-list__card-progress-label">
              已上 {{ (e.progress && e.progress.attendedLessons) || 0 }}/{{ (e.progress && e.progress.totalLessons) || 0 }} 节
            </text>
          </view>
        </view>
      </view>

      <view v-if="loadingMore" class="enroll-list__loadingmore">
        <text>加载中…</text>
      </view>
      <view v-else-if="!hasMore && list.length" class="enroll-list__nomore">
        <text>— 已经到底了 —</text>
      </view>

      <view class="enroll-list__bottom-spacer" />
    </scroll-view>
  </view>
</template>

<script>
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'

const PAGE_SIZE = 20

export default {
  data() {
    return {
      // 当前过滤状态:
      //   ''     全部 (不含 withdrawn)
      //   active 在读
      //   completed 已结业
      //   withdrawn 已退班
      //   cancelled 已取消
      filter: { status: '' },
      list: [],
      counts: { '': 0, active: 0, completed: 0, withdrawn: 0, cancelled: 0 },
      page: 1,
      pageSize: PAGE_SIZE,
      total: 0,
      loading: false,
      loadingMore: false
    }
  },
  computed: {
    hasMore() {
      return this.list.length < this.total
    },
    tabList() {
      return [
        { label: '全部', value: '' },
        { label: '在读', value: 'active' },
        { label: '已结业', value: 'completed' },
        { label: '已退班', value: 'withdrawn' }
      ]
    }
  },
  onShow() {
    this.refresh()
  },
  // 切换激活孩子时 (org-level activeStudent 变更) 重新拉取
  onPullDownRefresh() {
    this.refresh().finally(() => uni.stopPullDownRefresh())
  },
  methods: {
    async refresh() {
      this.list = []
      this.page = 1
      this.total = 0
      // counts 单独并发拉一次 (status=withdrawn 切页时要统计所有 4 种状态, 不依赖主查询的 filter)
      this.loadCounts()
      await this.loadPage()
    },

    // 拉一次 4 个状态的 count (R-1214 一次性给个 $ne 排除不一定准确, 各自发一次 pageSize=0 太费;
    // 简化为按 status= 各发一次, 数据规模 N=几 时无压力)
    async loadCounts() {
      const tasks = this.tabList.map((t) => {
        if (t.value === '') {
          // "全部" = 非 withdrawn, 后端默认; 页面要拉一遍只取 total
          return courseEnrollmentApi
            .me({ page: 1, pageSize: 1 })
            .then((r) => (this.counts[''] = r?.total || 0))
            .catch(() => {})
        }
        return courseEnrollmentApi
          .me({ status: t.value, page: 1, pageSize: 1 })
          .then((r) => (this.counts[t.value] = r?.total || 0))
          .catch(() => {})
      })
      await Promise.all(tasks)
    },

    async loadPage() {
      if (this.loading || this.loadingMore) return
      const isFirst = this.page === 1
      if (isFirst) this.loading = true
      else this.loadingMore = true

      try {
        const params = { page: this.page, pageSize: this.pageSize }
        if (this.filter.status) params.status = this.filter.status
        const res = await courseEnrollmentApi.me(params)
        const data = res?.data || res || {}
        const items = Array.isArray(data.items) ? data.items
          : Array.isArray(data) ? data
          : []
        if (isFirst) this.list = items
        else this.list.push(...items)
        this.total = data.total || data.totalCount || 0
        this.page++
      } catch (e) {
        console.warn('[enrollmentList.loadPage]', e)
        if (isFirst) this.list = []
      } finally {
        this.loading = false
        this.loadingMore = false
      }
    },

    onChangeTab(status) {
      if (this.filter.status === status) return
      haptic.tap()
      this.filter.status = status
      this.refresh()
    },

    onLower() {
      if (this.hasMore && !this.loading && !this.loadingMore) {
        this.loadPage()
      }
    },

    goCourseDetail(id) {
      if (!id) return
      haptic.tap()
      uni.navigateTo({ url: '/pages/course/instance-detail?id=' + id })
    },

    progressPct(value, total) {
      const v = Number(value) || 0
      const t = Number(total) || 0
      if (t <= 0) return '0%'
      return Math.min(100, Math.round((v / t) * 100)) + '%'
    },

    formatDate(d) {
      if (!d) return ''
      return date.fmtDate(d)
    },

    // 报名状态 tag 文案 (CourseEnrollment.status enum)
    statusLabel(s) {
      const map = {
        active: '在读',
        completed: '已结业',
        withdrawn: '已退班',
        cancelled: '已取消'
      }
      return map[s] || s || '在读'
    }
  }
}
</script>

<style lang="scss" scoped>
.enroll-list {
  min-height: 100vh;
  background: $bg-page;

  &__tabs {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    gap: $spacing-xs;
    padding: $spacing-md $spacing-md;
    background: $bg-card;
    border-bottom: 1rpx solid $divider-light;
  }

  &__tab {
    flex: 1;
    text-align: center;
    padding: 12rpx $spacing-xs;
    font-size: $font-sm;
    color: $text-secondary;
    background: $bg-page;
    border-radius: $radius-pill;
    transition: all $transition-fast;

    &.active {
      background: linear-gradient(135deg, $primary, $primary-light);
      color: #fff;
      font-weight: $font-weight-medium;
      box-shadow: 0 2rpx 8rpx rgba(255, 138, 101, 0.3);
    }
  }

  &__scroll {
    height: calc(100vh - 88rpx);
    padding: $spacing-md;
  }

  &__loading {
    padding: $spacing-xl;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  &__loadingmore,
  &__nomore {
    padding: $spacing-md;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-xs;
  }

  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: 120rpx $spacing-md;
  }
  &__empty-emoji { font-size: 80rpx; margin-bottom: $spacing-md; }
  &__empty-title {
    font-size: $font-lg;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }
  &__empty-desc {
    font-size: $font-sm;
    color: $text-tertiary;
  }

  &__cards {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__card {
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-xs;
  }
  &__card-name {
    flex: 1;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-right: $spacing-sm;
    @include multi-ellipsis(1);
  }
  &__card-tag {
    flex-shrink: 0;
    padding: 4rpx 12rpx;
    font-size: $font-xs;
    border-radius: $radius-pill;

    &--active { background: rgba(82, 196, 26, 0.12); color: #52C41A; }
    &--completed { background: rgba(91, 158, 230, 0.12); color: $primary; }
    &--withdrawn { background: rgba(155, 155, 155, 0.12); color: $text-tertiary; }
    &--cancelled { background: rgba(255, 138, 101, 0.12); color: $warning; }
  }
  &__card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-sm;
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: $spacing-sm;
  }
  &__card-progress {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }
  &__card-bar {
    flex: 1;
    height: 12rpx;
    background: rgba(0, 0, 0, 0.05);
    border-radius: $radius-pill;
    overflow: hidden;
  }
  &__card-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, $primary, $primary-light);
    border-radius: $radius-pill;
    transition: width $transition-base;
  }
  &__card-progress-label {
    flex-shrink: 0;
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>
