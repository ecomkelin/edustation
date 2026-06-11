<template>
  <view class="page">
    <view class="card" v-for="e in list" :key="e.id" @tap="go(`/pages/courseInstance/detail?id=${e.courseInstance?.id}`)">
      <view class="flex-row" style="justify-content: space-between;">
        <text class="text-16 text-strong">{{ productName(e) }}</text>
        <text :class="statusClass(e.status)">{{ statusLabel(e.status) }}</text>
      </view>
      <text v-if="teacherName(e) || roomName(e)" class="text-12 text-muted">
        {{ teacherName(e) }}{{ roomName(e) ? ' · ' + roomName(e) : '' }}
      </text>
      <text class="text-12 text-muted">报名时间：{{ formatDateTime(e.enrolledAt) }}</text>
    </view>
    <view v-if="!loading && !list.length" class="empty-state">
      <text>暂无报名</text>
    </view>
    <view class="fab" @tap="go('/pages/courseProduct/list')">去报名</view>
  </view>
</template>

<script>
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDateTime } from '@/utils/format'
import { CourseEnrollmentStatusLabel } from '@/utils/constants'

export default {
  data() { return { list: [], loading: true } },
  computed: { ...mapState(useStudentStore, ['activeStudentId']) },
  onShow() {
    if (this.activeStudentId) this.load()
  },
  methods: {
    formatDateTime,
    go(url) { uni.navigateTo({ url }) },
    productName(e) {
      const ci = e.courseInstance
      if (ci && ci.courseProduct) return ci.courseProduct.name
      return '课程'
    },
    teacherName(e) {
      const t = e.courseInstance && e.courseInstance.teacher
      return t ? (t.realName || t.mobile || '老师') : ''
    },
    roomName(e) {
      const r = e.courseInstance && e.courseInstance.room
      return r ? r.name : ''
    },
    statusLabel(s) { return CourseEnrollmentStatusLabel[s] || s },
    statusClass(s) {
      if (s === 'archived') return 'tag tag-success'
      if (s === 'dropped' || s === 'withdrew') return 'tag tag-warn'
      return 'tag'
    },
    async load() {
      this.loading = true
      try {
        const res = await courseEnrollmentApi.list({
          student: this.activeStudentId,
          pageSize: 50
        })
        this.list = res.data?.items || []
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
.page { padding: 24rpx; padding-bottom: 160rpx; }
.fab {
  position: fixed;
  right: 32rpx;
  bottom: 160rpx;
  background: #5B8FF9;
  color: #fff;
  padding: 16rpx 32rpx;
  border-radius: 32rpx;
  font-size: 26rpx;
}
</style>
