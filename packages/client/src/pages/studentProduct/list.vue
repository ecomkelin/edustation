<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!list.length" class="empty-state">
      <text>暂未持有任何课包</text>
      <text class="text-12 text-muted">报名或购买后会自动出现</text>
    </view>
    <view v-else>
      <view
        v-for="sp in list"
        :key="sp.id"
        class="card sp"
        :class="{ expired: isExpired(sp.expireDate), gift: sp.source === 'gift' }"
      >
        <view class="flex-row" style="justify-content: space-between;">
          <text class="text-16 text-strong">{{ sp.courseProduct?.name || '课包' }}</text>
          <text :class="sp.source === 'gift' ? 'tag tag-warn' : 'tag'">
            {{ sourceLabel(sp.source) }}
          </text>
        </view>
        <text v-if="sp.giftReason" class="text-12 text-muted">赠课原因：{{ sp.giftReason }}</text>
        <view class="divider" />
        <view class="progress">
          <view class="bar">
            <view
              class="bar-inner"
              :style="{ width: progress(sp) + '%' }"
              :class="{ low: sp.remainingLessons <= 3 }"
            />
          </view>
          <text class="text-12 text-muted">
            剩余 <text class="text-strong">{{ sp.remainingLessons }}</text> / {{ sp.totalLessons }} 课时
          </text>
        </view>
        <text v-if="sp.expireDate" class="text-12 text-muted">
          有效期至 {{ formatDate(sp.expireDate) }}
        </text>
        <text v-if="!sp.isActive" class="tag tag-warn">已失效</text>
      </view>
    </view>
  </view>
</template>

<script>
import { studentProductApi } from '@/api/studentProduct'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { sortStudentProductsFifo, StudentProductSourceLabel } from '@/utils/constants'
import { formatDate } from '@/utils/format'

export default {
  data() {
    return { list: [], loading: true }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId'])
  },
  onShow() {
    if (this.activeStudentId) this.load()
  },
  methods: {
    formatDate,
    sourceLabel(s) {
      return StudentProductSourceLabel[s] || ''
    },
    isExpired(d) {
      if (!d) return false
      return new Date(d).getTime() < Date.now()
    },
    progress(sp) {
      if (!sp.totalLessons) return 0
      return Math.max(0, Math.min(100, (sp.remainingLessons / sp.totalLessons) * 100))
    },
    async load() {
      this.loading = true
      try {
        const res = await studentProductApi.list({
          student: this.activeStudentId,
          isActive: true,
          pageSize: 50
        })
        this.list = sortStudentProductsFifo(res.data?.items || [])
      } catch (_) {
        this.list = []
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.sp {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  &.expired { opacity: 0.6; }
  &.gift { border-left: 8rpx solid #f5222d; }
}
.progress {
  display: flex;
  align-items: center;
  gap: 16rpx;
  .bar {
    flex: 1;
    height: 16rpx;
    border-radius: 8rpx;
    background: #f3f4f6;
    overflow: hidden;
  }
  .bar-inner {
    height: 100%;
    background: #5B8FF9;
    transition: width 0.3s;
    &.low { background: #f5222d; }
  }
}
</style>
