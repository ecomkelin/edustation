<template>
  <view class="page">
    <active-student-header />

    <!-- 法律协议强制接受 modal: pendingConsents > 0 时自动弹层 -->
    <agreement-modal />

    <!-- 概览卡片:剩余课时 + 积分 -->
    <view class="overview card">
      <view class="overview-item" @tap="go('/pages/studentProduct/list')">
        <text class="num">{{ remainingLessons }}</text>
        <text class="label">剩余课时</text>
      </view>
      <view class="divider-vertical" />
      <view class="overview-item" @tap="go('/pages/points/transaction')">
        <text class="num">{{ pointsBalance }}</text>
        <text class="label">积分</text>
      </view>
    </view>

    <!-- 周历：左右切换 -->
    <view class="week-bar">
      <view class="week-btn" @tap="shiftWeek(-1)">‹</view>
      <view class="week-title">
        <text>{{ weekRangeText }}</text>
        <text class="text-12 text-muted">{{ thisMonth }}</text>
      </view>
      <view class="week-btn" @tap="shiftWeek(1)">›</view>
    </view>

    <view class="weekdays">
      <view
        v-for="(d, i) in weekdays"
        :key="i"
        class="day"
        :class="{ active: isSameDay(d, today), today: isSameDay(d, today) }"
        @tap="selectDay(d)"
      >
        <text class="day-name">周{{ weekdayLabel[i] }}</text>
        <text class="day-num">{{ d.getDate() }}</text>
        <view v-if="hasLessonOn(d)" class="dot" />
      </view>
    </view>

    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else>
      <view v-if="!daySchedules.length" class="empty-state">
        <text>这一天没有课程</text>
      </view>
      <view v-else>
        <view
          v-for="ls in daySchedules"
          :key="ls.id"
          class="lesson card"
          @tap="go(`/pages/lessonSchedule/detail?id=${ls.id}`)"
        >
          <view class="time-block">
            <text class="time">{{ formatTime(ls.plannedStartTime) }}</text>
            <text class="time">{{ formatTime(ls.plannedEndTime) }}</text>
          </view>
          <view class="lesson-info flex-1">
            <view class="flex-row gap-8">
              <text class="text-16 text-strong">{{ productName(ls) }}</text>
              <text :class="statusClass(ls.status)">{{ statusLabel(ls.status) }}</text>
            </view>
            <text class="text-12 text-muted">
              {{ teacherName(ls) }}{{ roomName(ls) ? ' · ' + roomName(ls) : '' }}
            </text>
            <text v-if="ls.title" class="text-12">主题：{{ ls.title }}</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 浮动按钮：跳报名 -->
    <view class="fab" @tap="go('/pages/courseEnrollment/list')">
      <text>我的报名</text>
    </view>
  </view>
</template>

<script>
import ActiveStudentHeader from '@/components/active-student-header.vue'
import AgreementModal from '@/components/agreement-modal.vue'
import { useStudentStore } from '@/stores/student'
import { useAuthStore } from '@/stores/auth'
import { usePointsStore } from '@/stores/points'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { studentProductApi } from '@/api/studentProduct'
import { mapState } from 'pinia'
import { addDays, startOfWeek, formatTime } from '@/utils/format'
import { summarizeRemainingLessons, sortStudentProductsFifo, LessonScheduleStatusLabel, WeekdayLabel } from '@/utils/constants'

export default {
  components: { ActiveStudentHeader, AgreementModal },
  data() {
    return {
      loading: false,
      weekStart: startOfWeek(new Date()),
      selectedDay: new Date(),
      today: new Date(),
      schedules: [],
      studentProducts: [],
      weekdayLabel: WeekdayLabel
    }
  },
  computed: {
    ...mapState(useAuthStore, ['isAuthenticated']),
    ...mapState(useStudentStore, ['activeStudentId']),
    ...mapState(usePointsStore, ['balance']),
    weekdays() {
      return Array.from({ length: 7 }, (_, i) => addDays(this.weekStart, i))
    },
    weekRangeText() {
      const s = this.weekdays[0]
      const e = this.weekdays[6]
      const m1 = s.getMonth() + 1
      const m2 = e.getMonth() + 1
      if (m1 === m2) {
        return `${s.getFullYear()}.${m1}.${s.getDate()} - ${e.getDate()}`
      }
      return `${s.getFullYear()}.${m1}.${s.getDate()} - ${m2}.${e.getDate()}`
    },
    thisMonth() {
      const m = this.selectedDay.getMonth() + 1
      return `${this.selectedDay.getFullYear()}年${m}月`
    },
    daySchedules() {
      const sd = this.selectedDay
      const sStart = new Date(sd); sStart.setHours(0, 0, 0, 0)
      const sEnd = new Date(sd); sEnd.setHours(23, 59, 59, 999)
      return this.schedules
        .filter((ls) => {
          const t = new Date(ls.plannedStartTime).getTime()
          return t >= sStart.getTime() && t <= sEnd.getTime()
        })
        .sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    },
    remainingLessons() {
      return summarizeRemainingLessons(this.studentProducts)
    },
    pointsBalance() {
      return this.balance || 0
    }
  },
  onShow() {
    if (this.isAuthenticated && this.activeStudentId) {
      this.loadAll()
    } else if (this.isAuthenticated) {
      // 还没有当前孩子
      const s = useStudentStore()
      s.fetchMyStudents().then(() => this.loadAll()).catch(() => {})
    }
  },
  onPullDownRefresh() {
    this.loadAll().finally(() => uni.stopPullDownRefresh())
  },
  methods: {
    go(url) { uni.navigateTo({ url }) },
    shiftWeek(delta) {
      this.weekStart = addDays(this.weekStart, delta * 7)
      this.loadSchedules()
    },
    selectDay(d) {
      this.selectedDay = d
    },
    isSameDay(a, b) {
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
    },
    hasLessonOn(d) {
      const s = new Date(d); s.setHours(0, 0, 0, 0)
      const e = new Date(d); e.setHours(23, 59, 59, 999)
      return this.schedules.some((ls) => {
        const t = new Date(ls.plannedStartTime).getTime()
        return t >= s.getTime() && t <= e.getTime()
      })
    },
    async loadAll() {
      await Promise.all([this.loadSchedules(), this.loadStudentProducts(), this.loadPoints()])
    },
    async loadSchedules() {
      // 拉整周：start..end
      const start = this.weekdays[0]
      const end = addDays(this.weekdays[6], 1)
      this.loading = true
      try {
        const res = await lessonScheduleApi.list({
          start: start.toISOString(),
          end: end.toISOString(),
          pageSize: 200
        })
        this.schedules = res.data?.items || []
      } catch (_) {
        this.schedules = []
      } finally {
        this.loading = false
      }
    },
    async loadStudentProducts() {
      if (!this.activeStudentId) return
      try {
        const res = await studentProductApi.list({
          student: this.activeStudentId,
          isActive: true,
          pageSize: 50
        })
        this.studentProducts = sortStudentProductsFifo(res.data?.items || [])
      } catch (_) {
        this.studentProducts = []
      }
    },
    async loadPoints() {
      const pts = usePointsStore()
      try { await pts.fetchMe() } catch (_) {}
    },
    formatTime,
    productName(ls) {
      const ci = ls.courseInstance
      if (ci && ci.courseProduct) return ci.courseProduct.name || '课程'
      return '课程'
    },
    teacherName(ls) {
      const t = ls.teacher
      if (!t) return ''
      return t.realName || t.mobile || '老师'
    },
    roomName(ls) {
      const r = ls.room
      if (!r) return ''
      return r.name || ''
    },
    statusLabel(s) {
      return LessonScheduleStatusLabel[s] || s
    },
    statusClass(s) {
      const map = {
        scheduled: 'tag',
        in_progress: 'tag tag-success',
        completed: 'tag',
        cancelled: 'tag tag-warn'
      }
      return map[s] || 'tag'
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 160rpx; }
.overview {
  display: flex;
  align-items: center;
  padding: 32rpx 24rpx;
  background: linear-gradient(135deg, #5B8FF9 0%, #7AA9FF 100%);
  color: #fff;
  .overview-item {
    flex: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
  }
  .num { font-size: 56rpx; font-weight: 700; line-height: 1; }
  .label { font-size: 24rpx; opacity: 0.9; }
  .divider-vertical {
    width: 1rpx;
    height: 60rpx;
    background: rgba(255,255,255,0.3);
  }
}
.week-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16rpx 0;
  .week-title {
    text-align: center;
    display: flex;
    flex-direction: column;
    font-size: 28rpx;
  }
  .week-btn {
    width: 60rpx;
    height: 60rpx;
    border-radius: 50%;
    background: #ffffff;
    text-align: center;
    line-height: 56rpx;
    font-size: 40rpx;
    color: #5B8FF9;
    box-shadow: 0 2rpx 8rpx rgba(0,0,0,0.04);
  }
}
.weekdays {
  display: flex;
  gap: 8rpx;
  margin-bottom: 16rpx;
  .day {
    flex: 1;
    background: #ffffff;
    border-radius: 12rpx;
    padding: 16rpx 0;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4rpx;
    &.today { color: #5B8FF9; }
    &.active { background: #5B8FF9; color: #fff; }
    .day-name { font-size: 22rpx; }
    .day-num { font-size: 30rpx; font-weight: 600; }
    .dot {
      width: 8rpx;
      height: 8rpx;
      border-radius: 50%;
      background: #f5222d;
    }
  }
}
.lesson {
  display: flex;
  align-items: stretch;
  gap: 24rpx;
  padding: 24rpx;
  .time-block {
    width: 120rpx;
    border-right: 1rpx solid #e5e7eb;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    color: #5B8FF9;
    font-weight: 600;
  }
  .lesson-info {
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }
}
.fab {
  position: fixed;
  right: 32rpx;
  bottom: 160rpx;
  background: #5B8FF9;
  color: #fff;
  padding: 16rpx 32rpx;
  border-radius: 32rpx;
  box-shadow: 0 4rpx 12rpx rgba(91,143,249,0.3);
  font-size: 26rpx;
}
</style>
