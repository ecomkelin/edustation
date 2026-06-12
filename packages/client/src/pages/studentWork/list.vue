<template>
  <view class="page">
    <view class="filter-bar">
      <text class="filter-label">筛选</text>
      <text v-if="activeSubjectName" class="filter-pill">学科：{{ activeSubjectName }}</text>
      <text v-if="activeFilter !== 'all'" class="filter-pill">{{ filterLabel }}</text>
      <text v-if="hasFilter" class="filter-clear text-12 text-muted" @tap="clearFilter">清除</text>
    </view>

    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!list.length" class="empty-state">
      <text>暂无作品</text>
      <text class="text-12 text-muted">每节课完成的作品会自动展示在这里</text>
    </view>
    <view v-else class="grid">
      <view
        v-for="w in list"
        :key="w.id"
        class="card work"
        @tap="go(`/pages/studentWork/detail?id=${w.id}`)"
      >
        <image v-if="w.fileUrls && w.fileUrls[0]" :src="w.fileUrls[0]" mode="aspectFill" class="cover" />
        <view v-else class="cover cover-empty">📷</view>
        <text class="text-14 text-strong text-ellipsis">{{ w.title }}</text>
        <text v-if="w.subject && w.subject.name" class="text-12 text-muted">
          {{ w.subject.name }} · {{ formatDate(w.createdAt) }}
        </text>
        <text v-else class="text-12 text-muted">{{ formatDate(w.createdAt) }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { studentWorkApi } from '@/api/studentWork'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDate } from '@/utils/format'

export default {
  data() {
    return {
      list: [],
      loading: true,
      // URL 参数（互斥优先级：lessonAttendance > lessonSchedule > subject > student > all）
      lessonAttendance: '',
      lessonSchedule: '',
      subject: '',
      student: ''
    }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId']),
    hasFilter() {
      return this.lessonAttendance || this.lessonSchedule || this.subject || this.student
    },
    activeFilter() {
      if (this.lessonAttendance) return 'attendance'
      if (this.lessonSchedule) return 'schedule'
      if (this.subject) return 'subject'
      if (this.student) return 'student'
      return 'all'
    },
    filterLabel() {
      const map = { attendance: '按考勤', schedule: '按排课', student: '按学生' }
      return map[this.activeFilter] || ''
    },
    activeSubjectName() {
      // 简单展示：从 list[0]?.subject?.name 取；subject 详情时也用
      if (this.activeFilter === 'subject' && this.list[0] && this.list[0].subject) {
        return this.list[0].subject.name
      }
      return ''
    }
  },
  onLoad(query) {
    this.lessonAttendance = query.lessonAttendance || ''
    this.lessonSchedule = query.lessonSchedule || ''
    this.subject = query.subject || ''
    this.student = query.student || ''
  },
  onShow() {
    if (this.activeStudentId || this.hasFilter) this.load()
  },
  methods: {
    formatDate,
    go(url) { uni.navigateTo({ url }) },
    clearFilter() {
      this.lessonAttendance = ''
      this.lessonSchedule = ''
      this.subject = ''
      this.student = ''
      this.load()
    },
    async load() {
      this.loading = true
      try {
        const params = { pageSize: 30 }
        if (this.lessonAttendance) params.lessonAttendance = this.lessonAttendance
        else if (this.lessonSchedule) params.lessonSchedule = this.lessonSchedule
        else if (this.subject) params.subject = this.subject
        else if (this.student) params.student = this.student
        else if (this.activeStudentId) params.student = this.activeStudentId
        const res = await studentWorkApi.list(params)
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
.page { padding: 24rpx; }
.filter-bar {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-wrap: wrap;
  margin-bottom: 16rpx;
  .filter-label { font-size: 24rpx; color: #6b7280; }
  .filter-pill {
    background: #eff6ff;
    color: #1d4ed8;
    padding: 6rpx 16rpx;
    border-radius: 999rpx;
    font-size: 22rpx;
  }
  .filter-clear {
    margin-left: auto;
  }
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  .work {
    flex: 0 0 calc(50% - 8rpx);
    display: flex;
    flex-direction: column;
    gap: 8rpx;
  }
  .cover {
    width: 100%;
    height: 280rpx;
    border-radius: 12rpx;
    background: #f3f4f6;
  }
  .cover-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 64rpx;
    color: #9ca3af;
  }
}
.text-ellipsis {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
