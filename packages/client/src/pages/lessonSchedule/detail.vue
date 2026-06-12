<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!data" class="empty-state">
      <text>课程不存在或已删除</text>
    </view>
    <view v-else>
      <view class="card hero">
        <text class="title">{{ productName }}</text>
        <text class="text-12 text-muted" v-if="data.title">本节主题：{{ data.title }}</text>
        <view class="meta">
          <view class="meta-item">
            <text class="meta-label">时间</text>
            <text class="meta-value">{{ formatDateTime(data.plannedStartTime) }} - {{ formatTime(data.plannedEndTime) }}</text>
          </view>
          <view class="meta-item">
            <text class="meta-label">老师</text>
            <text class="meta-value">{{ teacherName }}</text>
          </view>
          <view class="meta-item">
            <text class="meta-label">教室</text>
            <text class="meta-value">{{ roomName || '-' }}</text>
          </view>
          <view class="meta-item">
            <text class="meta-label">状态</text>
            <text :class="statusClass">{{ statusLabel }}</text>
          </view>
        </view>
      </view>

      <view class="card">
        <text class="text-16 text-strong">课程简介</text>
        <view class="divider" />
        <text class="text-14">{{ syllabus || '暂无教学大纲' }}</text>
      </view>

      <view class="card">
        <text class="text-16 text-strong">我的考勤</text>
        <view class="divider" />
        <view v-if="attendance">
          <view class="flex-row gap-8">
            <text :class="attendanceStatusClass(attendance.status)">{{ attendanceLabel(attendance.status) }}</text>
            <text v-if="attendance.studentProduct" class="tag">
              剩余 {{ attendance.studentProduct.remainingLessons }}/{{ attendance.studentProduct.totalLessons }} 课时
            </text>
          </view>
          <text v-if="attendance.actualStartTime" class="text-12 text-muted">
            签到：{{ formatDateTime(attendance.actualStartTime) }}
          </text>
          <text v-if="attendance.actualEndTime" class="text-12 text-muted">
            结束：{{ formatDateTime(attendance.actualEndTime) }}
          </text>
        </view>
        <view v-else class="text-12 text-muted">
          当前孩子在本节课暂无考勤（可能未持有效课包）
        </view>
      </view>

      <view class="card">
        <view class="flex-row" style="justify-content: space-between;">
          <text class="text-16 text-strong">课堂作品</text>
          <text class="text-12 text-muted" @tap="go(`/pages/studentWork/list?lessonSchedule=${data.id}`)">
            查看全部 ›
          </text>
        </view>
        <view class="divider" />
        <view v-if="works.length" class="works">
          <view
            v-for="w in works.slice(0, 3)"
            :key="w.id"
            class="work-card"
            @tap="go(`/pages/studentWork/detail?id=${w.id}`)"
          >
            <image v-if="w.fileUrls && w.fileUrls[0]" :src="w.fileUrls[0]" mode="aspectFill" class="cover" />
            <view v-else class="cover cover-empty">📷</view>
            <text class="text-12 text-strong text-ellipsis">{{ w.title }}</text>
          </view>
        </view>
        <view v-else class="text-12 text-muted">暂无作品</view>
      </view>
    </view>
  </view>
</template>

<script>
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { studentWorkApi } from '@/api/studentWork'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDateTime, formatTime } from '@/utils/format'
import { LessonScheduleStatusLabel, AttendanceStatus, AttendanceStatusLabel } from '@/utils/constants'

export default {
  data() {
    return {
      loading: true,
      id: '',
      data: null,
      attendance: null,
      works: []
    }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId']),
    productName() {
      const ci = this.data && this.data.courseInstance
      if (ci && ci.courseProduct) return ci.courseProduct.name
      return '课程'
    },
    syllabus() {
      const ci = this.data && this.data.courseInstance
      return ci && ci.courseProduct ? ci.courseProduct.syllabus : ''
    },
    teacherName() {
      const t = this.data && this.data.teacher
      if (!t) return '-'
      return t.realName || t.mobile || '-'
    },
    roomName() {
      const r = this.data && this.data.room
      return r ? r.name : ''
    },
    statusLabel() {
      return LessonScheduleStatusLabel[this.data?.status] || ''
    },
    statusClass() {
      const s = this.data?.status
      if (s === 'completed') return 'tag tag-success'
      if (s === 'in_progress') return 'tag tag-success'
      if (s === 'cancelled') return 'tag tag-warn'
      return 'tag'
    }
  },
  onLoad(query) {
    this.id = query.id
    this.loadAll()
  },
  methods: {
    go(url) { uni.navigateTo({ url }) },
    formatDateTime, formatTime,
    async loadAll() {
      this.loading = true
      try {
        const res = await lessonScheduleApi.detail(this.id)
        this.data = res.data
        await Promise.all([this.loadAttendance(), this.loadWorks()])
      } catch (_) {
        this.data = null
      } finally {
        this.loading = false
      }
    },
    async loadAttendance() {
      if (!this.activeStudentId) return
      try {
        const res = await lessonAttendanceApi.list({
          lessonSchedule: this.id,
          student: this.activeStudentId,
          pageSize: 1
        })
        this.attendance = (res.data?.items || [])[0] || null
      } catch (_) {
        this.attendance = null
      }
    },
    async loadWorks() {
      try {
        const res = await studentWorkApi.list({
          lessonSchedule: this.id,
          student: this.activeStudentId,
          pageSize: 30
        })
        this.works = res.data?.items || []
      } catch (_) {
        this.works = []
      }
    },
    attendanceLabel(s) {
      return AttendanceStatusLabel[s] || ''
    },
    attendanceStatusClass(s) {
      if (s === AttendanceStatus.COMPLETED) return 'tag tag-success'
      if (s === AttendanceStatus.NO_SHOW) return 'tag tag-warn'
      if (s === AttendanceStatus.LEAVE) return 'tag'
      return 'tag'
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.hero {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  .title {
    font-size: 36rpx;
    font-weight: 600;
    color: #1f2937;
  }
  .meta {
    display: flex;
    flex-direction: column;
    gap: 12rpx;
    margin-top: 8rpx;
  }
  .meta-item {
    display: flex;
    align-items: center;
    gap: 16rpx;
    .meta-label { width: 100rpx; font-size: 24rpx; color: #6b7280; }
    .meta-value { font-size: 28rpx; color: #1f2937; }
  }
}
.works {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
  .work-card {
    width: 200rpx;
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }
  .cover {
    width: 200rpx;
    height: 200rpx;
    border-radius: 12rpx;
    background: #f3f4f6;
  }
  .cover-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48rpx;
    color: #9ca3af;
  }
}
.text-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 200rpx;
}
</style>
