<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!data" class="empty-state">开班不存在</view>
    <view v-else>
      <view class="card hero">
        <text class="title">{{ productName }}</text>
        <text :class="statusClass" class="status">{{ statusLabel }}</text>
        <view class="divider" />
        <view class="row">
          <text class="text-12 text-muted">老师</text>
          <text class="text-14">{{ teacherName }}</text>
        </view>
        <view class="row">
          <text class="text-12 text-muted">教室</text>
          <text class="text-14">{{ roomName || '-' }}</text>
        </view>
        <view class="row">
          <text class="text-12 text-muted">开课日期</text>
          <text class="text-14">{{ formatDate(data.startDate) }}</text>
        </view>
        <view class="row">
          <text class="text-12 text-muted">招生上限</text>
          <text class="text-14">{{ data.maxStudents || 0 }} 人（仅作参考）</text>
        </view>
      </view>

      <view class="card">
        <text class="text-16 text-strong">排课计划</text>
        <view class="divider" />
        <view class="row"><text class="text-12 text-muted">每周</text><text class="text-14">{{ sp.lessonsPerWeek }} 节</text></view>
        <view class="row"><text class="text-12 text-muted">总课时</text><text class="text-14">{{ sp.totalPlannedLessons }} 节</text></view>
        <view class="row" v-if="sp.restDays && sp.restDays.length">
          <text class="text-12 text-muted">休息日</text>
          <text class="text-14">{{ restDaysText }}</text>
        </view>
        <view class="row" v-if="sp.minutesPerLesson">
          <text class="text-12 text-muted">单节时长</text>
          <text class="text-14">{{ sp.minutesPerLesson }} 分钟</text>
        </view>
      </view>

      <view class="card">
        <text class="text-16 text-strong">课程大纲</text>
        <view class="divider" />
        <text class="text-14">{{ syllabus || '暂无' }}</text>
      </view>

      <view v-if="canEnroll" class="footer">
        <button class="btn-primary" @tap="onEnroll">立即报名</button>
      </view>
    </view>
  </view>
</template>

<script>
import { courseInstanceApi } from '@/api/courseInstance'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDate } from '@/utils/format'
import { CourseInstanceStatus, CourseInstanceStatusLabel, WeekdayLabel } from '@/utils/constants'

export default {
  data() { return { id: '', data: null, loading: true } },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId']),
    sp() { return this.data?.schedulePlan || {} },
    productName() {
      const cp = this.data?.courseProduct
      return (cp && cp.name) || '课程'
    },
    syllabus() {
      const cp = this.data?.courseProduct
      return (cp && cp.syllabus) || ''
    },
    teacherName() {
      const t = this.data?.teacher
      return t ? (t.realName || t.mobile || '老师') : '-'
    },
    roomName() {
      return this.data?.room?.name || ''
    },
    statusLabel() {
      return CourseInstanceStatusLabel[this.data?.status] || ''
    },
    statusClass() {
      const s = this.data?.status
      if (s === CourseInstanceStatus.ACTIVE) return 'tag tag-success'
      if (s === CourseInstanceStatus.CLOSED) return 'tag'
      return 'tag'
    },
    canEnroll() {
      const s = this.data?.status
      return s === CourseInstanceStatus.ENROLLING || s === CourseInstanceStatus.ACTIVE
    },
    restDaysText() {
      const r = this.sp.restDays || []
      if (!r.length) return '无'
      return r.map((d) => '周' + WeekdayLabel[d]).join('、')
    }
  },
  onLoad(query) {
    this.id = query.id
    this.load()
  },
  methods: {
    formatDate,
    async load() {
      this.loading = true
      try {
        const res = await courseInstanceApi.detail(this.id)
        this.data = res.data
      } catch (_) {
        this.data = null
      } finally {
        this.loading = false
      }
    },
    async onEnroll() {
      if (!this.activeStudentId) {
        return uni.showToast({ title: '请先选择孩子', icon: 'none' })
      }
      const r = await uni.showModal({ title: '确认报名？' })
      if (!r.confirm) return
      try {
        await courseEnrollmentApi.create({
          courseInstance: this.id,
          student: this.activeStudentId
        })
        uni.showToast({ title: '报名成功', icon: 'success' })
      } catch (_) {}
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 160rpx; }
.hero {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  .title { font-size: 36rpx; font-weight: 600; }
  .status { align-self: flex-start; }
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
}
.footer {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  background: #fff;
  padding: 16rpx 24rpx;
  box-shadow: 0 -2rpx 12rpx rgba(0,0,0,0.05);
}
</style>
