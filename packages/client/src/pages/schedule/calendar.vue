<!--
  完整课表 - 月历视图
-->
<template>
  <view class="calendar-page">
    <view class="calendar-page__header">
      <view class="calendar-page__month-nav">
        <view class="calendar-page__nav-btn press" @tap="changeMonth(-1)">
          <text>‹</text>
        </view>
        <text class="calendar-page__month-title">{{ monthTitle }}</text>
        <view class="calendar-page__nav-btn press" @tap="changeMonth(1)">
          <text>›</text>
        </view>
      </view>
    </view>

    <view class="calendar-page__weekdays">
      <text v-for="d in ['日', '一', '二', '三', '四', '五', '六']" :key="d" class="calendar-page__weekday">
        {{ d }}
      </text>
    </view>

    <view class="calendar-page__days">
      <view
        v-for="(d, i) in calendarDays"
        :key="i"
        class="calendar-page__day"
        :class="{
          'calendar-page__day--out': !d.inMonth,
          'calendar-page__day--today': d.isToday,
          'calendar-page__day--selected': d.isSelected,
          'calendar-page__day--has-lesson': d.lessonCount > 0
        }"
        @tap="selectDay(d)"
      >
        <text class="calendar-page__day-num">{{ d.day }}</text>
        <view v-if="d.lessonCount > 0" class="calendar-page__day-dot" />
      </view>
    </view>

    <view class="calendar-page__day-detail">
      <view class="calendar-page__detail-title">
        <text>{{ selectedDayLabel }} 的课程</text>
        <text v-if="selectedDayLessons.length" class="calendar-page__detail-count">
          共 {{ selectedDayLessons.length }} 节
        </text>
      </view>

      <view v-if="loading" class="calendar-page__loading">
        <text>加载中...</text>
      </view>
      <view v-else-if="!selectedDayLessons.length" class="calendar-page__day-empty">
        <text>这一天没有课程</text>
      </view>
      <view v-else class="calendar-page__day-list">
        <view
          v-for="lesson in selectedDayLessons"
          :key="lesson._id"
          class="calendar-page__item press"
          @tap="goDetail(lesson._id)"
        >
          <view class="calendar-page__item-time">
            <text class="calendar-page__item-time-h">{{ formatTime(lesson.plannedStartTime) }}</text>
            <text class="calendar-page__item-time-dur">{{ durationLabel(lesson) }}</text>
          </view>
          <view class="calendar-page__item-info">
            <text class="calendar-page__item-title">{{ lesson.courseInstance?.name || lesson.subject?.name || '课程' }}</text>
            <text class="calendar-page__item-meta">
              {{ lesson.teacher?.realName || '老师' }} · {{ lesson.room?.name || '教室' }}
            </text>
          </view>
          <view class="calendar-page__item-arrow">
            <text>›</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { date } from '@/utils/date'
import { useStudentStore } from '@/stores/student'

export default {
  data() {
    return {
      year: new Date().getFullYear(),
      month: new Date().getMonth() + 1,
      selectedDate: '',
      loading: true,
      monthLessons: []
    }
  },
  computed: {
    monthTitle() {
      return `${this.year} 年 ${this.month} 月`
    },
    selectedDayLabel() {
      const d = this.selectedDate ? new Date(this.selectedDate) : new Date()
      return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
    },
    calendarDays() {
      const firstDay = new Date(this.year, this.month - 1, 1)
      const lastDay = new Date(this.year, this.month, 0)
      const startWeekday = firstDay.getDay()
      const daysInMonth = lastDay.getDate()
      const today = date.fmtDate(new Date())
      const selected = this.selectedDate || today

      const days = []
      // 上月填充
      for (let i = startWeekday - 1; i >= 0; i--) {
        const d = new Date(this.year, this.month - 1, -i)
        days.push({
          date: date.fmtDate(d),
          day: d.getDate(),
          inMonth: false,
          isToday: false,
          isSelected: false,
          lessonCount: 0
        })
      }
      // 本月
      for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(this.year, this.month - 1, i)
        const ds = date.fmtDate(d)
        const count = this.monthLessons.filter((l) => date.fmtDate(l.plannedStartTime) === ds).length
        days.push({
          date: ds,
          day: i,
          inMonth: true,
          isToday: ds === today,
          isSelected: ds === selected,
          lessonCount: count
        })
      }
      // 下月填充到 6 行
      const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7
      let nextDay = 1
      while (days.length < totalCells) {
        const d = new Date(this.year, this.month, nextDay)
        days.push({
          date: date.fmtDate(d),
          day: nextDay,
          inMonth: false,
          isToday: false,
          isSelected: false,
          lessonCount: 0
        })
        nextDay++
      }
      return days
    },
    selectedDayLessons() {
      if (!this.selectedDate) return []
      return this.monthLessons
        .filter((l) => date.fmtDate(l.plannedStartTime) === this.selectedDate)
        .sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    }
  },
  onShow() {
    if (!this.selectedDate) this.selectedDate = date.fmtDate(new Date())
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const start = new Date(this.year, this.month - 1, 1)
        const end = new Date(this.year, this.month, 0)
        const res = await lessonScheduleApi.calendar({
          student: useStudentStore().activeStudentId || undefined,
          from: date.fmtDate(start),
          to: date.fmtDate(end),
          isTrialLesson: false
        })
        let list = res
        if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        else if (!Array.isArray(res)) list = []
        this.monthLessons = list.map((l) => ({ ...l, _id: l._id || l.id }))
      } catch (e) {
        this.monthLessons = []
      } finally {
        this.loading = false
      }
    },

    changeMonth(delta) {
      let m = this.month + delta
      let y = this.year
      if (m > 12) {
        m = 1
        y++
      } else if (m < 1) {
        m = 12
        y--
      }
      this.year = y
      this.month = m
      this.load()
    },

    selectDay(d) {
      if (!d.inMonth) return
      this.selectedDate = d.date
    },

    formatTime: (d) => (d ? new Date(d).toTimeString().slice(0, 5) : ''),
    durationLabel(l) {
      if (!l?.plannedStartTime || !l?.plannedEndTime) return ''
      return Math.round((new Date(l.plannedEndTime) - new Date(l.plannedStartTime)) / 60000) + '分钟'
    },

    goDetail(id) {
      uni.navigateTo({ url: `/pages/schedule/detail?id=${id}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.calendar-page {
  min-height: 100vh;
  background: $bg-page;
  padding-top: env(safe-area-inset-top);

  &__header {
    padding: $spacing-md;
    background: linear-gradient(180deg, #FFE4D3 0%, $bg-page 100%);
  }

  &__month-nav {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: $spacing-md;
  }

  &__nav-btn {
    width: 64rpx;
    height: 64rpx;
    background: $bg-card;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: $font-lg;
    color: $text-primary;
    box-shadow: $shadow-card;
  }

  &__month-title {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    min-width: 220rpx;
    text-align: center;
  }

  &__weekdays {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    padding: $spacing-sm $spacing-md;
    background: $bg-card;
  }

  &__weekday {
    text-align: center;
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4rpx;
    padding: 0 $spacing-md $spacing-md;
    background: $bg-card;
  }

  &__day {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: $radius-sm;
    transition: all $transition-fast;
    position: relative;

    &--out {
      opacity: 0.3;
    }

    &--today {
      .calendar-page__day-num {
        color: $primary;
        font-weight: $font-weight-bold;
      }
    }

    &--selected {
      background: linear-gradient(135deg, $primary, $primary-light);
      box-shadow: 0 4rpx 12rpx rgba(255, 138, 101, 0.32);

      .calendar-page__day-num {
        color: #fff !important;
        font-weight: $font-weight-bold;
      }
      .calendar-page__day-dot {
        background: #fff !important;
      }
    }

    &--has-lesson {
      .calendar-page__day-dot {
        background: $primary;
      }
    }

    &:active:not(&--out) {
      background: $primary-lighter;
    }
  }

  &__day-num {
    font-size: $font-base;
    color: $text-primary;
  }

  &__day-dot {
    width: 8rpx;
    height: 8rpx;
    border-radius: 50%;
    background: transparent;
    margin-top: 4rpx;
  }

  &__day-detail {
    padding: $spacing-md;
  }

  &__detail-title {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: $spacing-md;
  }

  &__detail-title > text:first-child {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  &__detail-count {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__loading {
    padding: $spacing-md;
    text-align: center;
    color: $text-secondary;
    font-size: $font-sm;
  }

  &__day-empty {
    padding: $spacing-2xl;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  &__day-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }

  &__item-time {
    min-width: 120rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  &__item-time-h {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $primary;
  }

  &__item-time-dur {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 4rpx;
  }

  &__item-info {
    flex: 1;
    margin-left: $spacing-md;
  }

  &__item-title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    display: block;
    margin-bottom: 4rpx;
  }

  &__item-meta {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__item-arrow {
    font-size: 40rpx;
    color: $text-tertiary;
  }
}
</style>