<!--
  首页 (家) - 核心:今日课 + 周历 + 当前孩子 + 宠物卡片
-->
<template>
  <view class="home">
    <!-- 顶部渐变背景 -->
    <view class="home__top">
      <view class="home__bg-circle home__bg-circle--1" />
      <view class="home__bg-circle home__bg-circle--2" />

      <view class="home__topbar safe-area-top">
        <view class="home__greeting">
          <text class="home__greet-text">{{ greeting }},</text>
          <text class="home__greet-name">{{ userName }} 👋</text>
        </view>
        <view class="home__notif press" @tap="onNotif">
          <text class="home__notif-icon">🔔</text>
        </view>
      </view>

      <view class="home__top-content">
        <active-student-header @change="onStudentChange" />
      </view>
    </view>

    <!-- 主体内容 -->
    <scroll-view scroll-y class="home__body" @scrolltolower="onLower">
      <!-- 今日课程 -->
      <view class="home__section">
        <view class="section-title">
          <text>📚 今日课程</text>
          <text class="section-title__more section-title__more--cta" @tap="goCalendar">📅 完整课表</text>
        </view>

        <view v-if="loading" class="home__loading">
          <view v-for="i in 2" :key="i" class="home__lesson-skeleton" />
        </view>

        <empty-state
          v-else-if="!todayLessons.length"
          title="今天没有课哦"
          desc="享受轻松的一天,明天见！"
          emoji="🌈"
          bg-color="#FFE4D3"
        />

        <view v-else class="home__lessons">
          <view
            v-for="lesson in todayLessons"
            :key="lesson._id"
            class="home__lesson press"
            @tap="goLessonDetail(lesson._id)"
          >
            <view class="home__lesson-time">
              <text class="home__lesson-time-h">{{ formatTime(lesson.plannedStartTime) }}</text>
              <text class="home__lesson-time-dur">{{ durationLabel(lesson) }}</text>
            </view>
            <view class="home__lesson-divider" />
            <view class="home__lesson-info">
              <text class="home__lesson-title">{{ lesson.courseInstance?.name || lesson.subject?.name || '课程' }}</text>
              <view class="home__lesson-meta">
                <text>👨‍🏫 {{ lesson.teacher?.realName || '老师' }}</text>
                <text>📍 {{ lesson.room?.name || '教室待定' }}</text>
              </view>
              <view v-if="isFuture(lesson.plannedStartTime)" class="home__lesson-countdown">
                <text>⏰ {{ countdownText(lesson.plannedStartTime) }}</text>
              </view>
              <view v-else class="home__lesson-status">
                <view class="tag" :class="statusClass(lesson.status)">
                  <text>{{ statusLabel(lesson.status) }}</text>
                </view>
              </view>
            </view>
            <view class="home__lesson-arrow">
              <text>›</text>
            </view>
          </view>
        </view>
      </view>

      <!-- 本周课表 (周历) -->
      <view class="home__section">
        <view class="section-title">
          <text>📅 本周课表</text>
        </view>

        <scroll-view scroll-x class="home__week" show-scrollbar="false">
          <view class="home__week-inner">
            <view
              v-for="day in weekDays"
              :key="day.date"
              class="home__week-day"
              :class="{ 'home__week-day--today': day.isToday, 'home__week-day--selected': day.isSelected }"
              @tap="selectDay(day)"
            >
              <text class="home__week-day-name">{{ day.name }}</text>
              <text class="home__week-day-date">{{ day.dateLabel }}</text>
              <view v-if="day.hasLesson" class="home__week-day-dot" />
            </view>
          </view>
        </scroll-view>

        <view v-if="selectedDayLessons.length" class="home__day-list">
          <view
            v-for="lesson in selectedDayLessons"
            :key="lesson._id"
            class="home__day-item press"
            @tap="goLessonDetail(lesson._id)"
          >
            <view class="home__day-time">
              <text>{{ formatTime(lesson.plannedStartTime) }}</text>
            </view>
            <view class="home__day-info">
              <text class="home__day-title">{{ lesson.courseInstance?.name || lesson.subject?.name || '课程' }}</text>
              <text class="home__day-meta">{{ lesson.teacher?.realName || '老师' }}</text>
            </view>
          </view>
        </view>
        <view v-else class="home__day-empty">
          <text>{{ !selectedDay ? '' : (selectedDay.isToday ? '今天没有课哦' : selectedDay.name + '没有课') }}</text>
        </view>
      </view>

      <!-- 快捷入口 -->
      <view class="home__section">
        <view class="section-title">
          <text>🎯 快捷入口</text>
        </view>
        <view class="home__quick">
          <view
            v-for="item in quickEntries"
            :key="item.label"
            class="home__quick-item press"
            @tap="goPage(item.url)"
          >
            <view class="home__quick-icon" :style="{ background: item.bg }">
              <text class="home__quick-emoji">{{ item.icon }}</text>
            </view>
            <text class="home__quick-label">{{ item.label }}</text>
          </view>
        </view>
      </view>

      <view class="home__bottom-spacer" />
    </scroll-view>

    <!-- 协议墙 -->
    <pending-consents
      v-if="showConsents"
      :visible="showConsents"
      :list="pendingList"
      @done="onConsentsDone"
    />
  </view>
</template>

<script>
import { mapState, mapGetters } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import ActiveStudentHeader from '@/components/layout/ActiveStudentHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import PendingConsents from '@/components/auth/PendingConsents.vue'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { pointsApi } from '@/api/points'
import { petApi } from '@/api/pet'
import { date } from '@/utils/date'
import { greetingByHour } from '@/utils/constants'
import { haptic } from '@/utils/haptic'

const TIER_EMOJI = { C: '🥚', B: '🐣', A: '🦊', S: '🐉' }

export default {
  components: { ActiveStudentHeader, EmptyState, PendingConsents },
  data() {
    return {
      loading: true,
      weekLessons: [],
      selectedDate: '',
      showConsents: false,
      pendingList: []
    }
  },
  computed: {
    ...mapState(useAuthStore, ['user', 'pendingConsents']),
    ...mapGetters(useAuthStore, ['hasPendingConsents']),
    ...mapState(useStudentStore, ['activeStudentId']),

    userName() {
      return this.user?.realName || this.user?.mobile?.slice(-4) || '朋友'
    },
    greeting() {
      return greetingByHour()
    },
    weekDays() {
      const start = date.startOfWeek()
      const today = date.fmtDate(new Date())
      const days = []
      for (let i = 0; i < 7; i++) {
        const d = date.addDays(start, i)
        const dateStr = date.fmtDate(d)
        const lessons = this.weekLessons.filter((l) => date.fmtDate(l.plannedStartTime) === dateStr)
        days.push({
          date: dateStr,
          name: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][new Date(d).getDay()],
          dateLabel: String(new Date(d).getDate()),
          isToday: dateStr === today,
          isSelected: dateStr === this.selectedDate,
          hasLesson: lessons.length > 0
        })
      }
      return days
    },
    todayLessons() {
      const today = date.fmtDate(new Date())
      return this.weekLessons
        .filter((l) => date.fmtDate(l.plannedStartTime) === today)
        .sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    },
    selectedDayLessons() {
      if (!this.selectedDate) return []
      return this.weekLessons
        .filter((l) => date.fmtDate(l.plannedStartTime) === this.selectedDate)
        .sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    },
    selectedDay() {
      if (!this.selectedDate) return null
      return this.weekDays.find((d) => d.date === this.selectedDate) || null
    },
    quickEntries() {
      return [
        { label: '我的课包', icon: '🎒', bg: '#FFE4D3', url: '/pages/studentProduct/list' },
        { label: '作品墙', icon: '🎨', bg: '#E5F0FA', url: '/pages/work/list' },
        { label: '积分钱包', icon: '💰', bg: '#FFF1D0', url: '/pages/points/wallet' },
        { label: '接送授权', icon: '🚪', bg: '#C8F0DF', url: '/pages/access/pickups' }
      ]
    }
  },
  watch: {
    activeStudentId() {
      this.load()
    },
    pendingConsents: {
      handler(list) {
        if (Array.isArray(list) && list.length) {
          this.pendingList = list
          this.showConsents = true
        }
      },
      immediate: true
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
        const now = new Date()
        const start = date.startOfWeek()
        const end = date.addDays(start, 14) // 取两周更稳
        const res = await lessonScheduleApi.myCalendar({
          from: date.fmtDate(start),
          to: date.fmtDate(end),
          isTrialLesson: false
        })
        // 响应可能是数组 / {items: []} / {data: []}
        let list = res
        if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        else if (!Array.isArray(res)) list = []
        this.weekLessons = list.map((l) => ({ ...l, _id: l._id || l.id }))
      } catch (e) {
        console.warn('[home.load]', e)
        this.weekLessons = []
      } finally {
        this.loading = false
      }
    },

    selectDay(day) {
      haptic.tap()
      this.selectedDate = day.date
    },

    formatTime: (d) => (d ? new Date(d).toTimeString().slice(0, 5) : ''),
    isFuture: (d) => d && new Date(d) > new Date(),
    countdownText: (d) => date.countdownLabel(d),

    durationLabel(lesson) {
      if (!lesson.plannedStartTime || !lesson.plannedEndTime) return ''
      const min = Math.round(
        (new Date(lesson.plannedEndTime) - new Date(lesson.plannedStartTime)) / 60000
      )
      return min + ' 分钟'
    },

    statusClass(s) {
      const map = {
        scheduled: 'tag-info',
        preparing: 'tag-info',
        in_progress: 'tag-success',
        finished: 'tag-success',
        archived: 'tag-ghost',
        cancelled: 'tag-warn'
      }
      return map[s] || 'tag-info'
    },
    statusLabel(s) {
      const map = {
        scheduled: '待上课',
        preparing: '备课中',
        in_progress: '进行中',
        finished: '已结束',
        archived: '已归档',
        cancelled: '已取消'
      }
      return map[s] || s
    },

    onStudentChange() {
      this.load()
    },

    goCalendar() {
      uni.navigateTo({ url: '/pages/schedule/calendar' })
    },

    goLessonDetail(id) {
      uni.navigateTo({ url: `/pages/schedule/detail?id=${id}` })
    },

    goPage(url) {
      uni.navigateTo({ url })
    },

    onNotif() {
      uni.showToast({ title: '通知中心 (待开发)', icon: 'none' })
    },

    onLower() {
      // 预留给无限滚动
    },

    onConsentsDone() {
      const auth = useAuthStore()
      auth.clearPendingConsents()
      this.showConsents = false
      haptic.success()
    }
  }
}
</script>

<style lang="scss" scoped>
.home {
  min-height: 100vh;
  background: $bg-page;

  &__top {
    background: linear-gradient(180deg, #FFB088 0%, #FFE4D3 60%, $bg-page 100%);
    padding-bottom: $spacing-md;
    position: relative;
    overflow: hidden;
  }

  &__bg-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.4;
    animation: float 6s ease-in-out infinite;
    pointer-events: none;

    &--1 {
      width: 240rpx;
      height: 240rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: -60rpx;
      right: -40rpx;
    }
    &--2 {
      width: 180rpx;
      height: 180rpx;
      background: radial-gradient(circle, $accent-light 0%, transparent 70%);
      top: 80rpx;
      left: -60rpx;
      animation-delay: 1.5s;
    }
  }

  &__topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-md $spacing-md $spacing-sm;
    position: relative;
  }

  &__greeting {
    display: flex;
    align-items: baseline;
  }

  &__greet-text {
    font-size: $font-base;
    color: $text-secondary;
    margin-right: 8rpx;
  }

  &__greet-name {
    font-size: $font-xl;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  &__notif {
    width: 72rpx;
    height: 72rpx;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8rpx);
  }

  &__notif-icon {
    font-size: 36rpx;
  }

  &__top-content {
    padding: 0 $spacing-md;
    position: relative;
  }

  &__body {
    padding: 0 $spacing-md;
    height: calc(100vh - 280rpx);
  }

  &__section {
    padding: $spacing-md 0;
  }

  &__loading {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__lesson-skeleton {
    height: 144rpx;
    background: linear-gradient(90deg, $divider-light 0%, #f8f4ee 50%, $divider-light 100%);
    background-size: 200% 100%;
    border-radius: $radius-md;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  &__lessons {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__lesson {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    transition: all $transition-fast;

    &:active {
      transform: scale(0.98);
    }
  }

  &__lesson-time {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 120rpx;
  }

  &__lesson-time-h {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1.2;
  }

  &__lesson-time-dur {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 4rpx;
  }

  &__lesson-divider {
    width: 1rpx;
    height: 56rpx;
    background: $divider;
    margin: 0 $spacing-md;
  }

  &__lesson-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  &__lesson-title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 8rpx;
  }

  &__lesson-meta {
    display: flex;
    gap: $spacing-sm;
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: 8rpx;
  }

  &__lesson-countdown {
    font-size: $font-xs;
    color: $primary;
  }

  &__lesson-status {
    align-self: flex-start;
  }

  &__lesson-arrow {
    font-size: 40rpx;
    color: $text-tertiary;
    margin-left: $spacing-sm;
  }

  // 周历
  &__week {
    margin: 0 (-$spacing-md);
    padding: 0 $spacing-md;
  }

  &__week-inner {
    display: inline-flex;
    gap: $spacing-xs;
    padding: $spacing-xs 0;
  }

  &__week-day {
    flex-shrink: 0;
    width: 96rpx;
    height: 120rpx;
    background: $bg-card;
    border-radius: $radius-md;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    box-shadow: $shadow-card;
    transition: all $transition-fast;

    &--today {
      background: $primary-lighter;
    }

    &--selected {
      background: linear-gradient(135deg, $primary, $primary-light);
      box-shadow: $shadow-button;
      transform: translateY(-4rpx);
    }
  }

  &__week-day-name {
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: 4rpx;

    .home__week-day--selected & {
      color: rgba(255, 255, 255, 0.9);
    }
  }

  &__week-day-date {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;

    .home__week-day--selected & {
      color: #fff;
    }
  }

  &__week-day-dot {
    position: absolute;
    bottom: 12rpx;
    width: 8rpx;
    height: 8rpx;
    border-radius: 50%;
    background: $primary;

    .home__week-day--selected & {
      background: #fff;
    }
  }

  &__day-list {
    margin-top: $spacing-md;
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }

  &__day-item {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    background: $bg-card;
    border-radius: $radius-sm;
    box-shadow: $shadow-card;
  }

  &__day-time {
    min-width: 100rpx;
    font-size: $font-sm;
    color: $primary;
    font-weight: $font-weight-semibold;
  }

  &__day-info {
    flex: 1;
    margin-left: $spacing-sm;
  }

  &__day-title {
    font-size: $font-base;
    color: $text-primary;
    display: block;
  }

  &__day-meta {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__day-empty {
    margin-top: $spacing-md;
    text-align: center;
    padding: $spacing-md;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  // 快捷入口
  &__quick {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: $spacing-sm;
  }

  &__quick-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: $spacing-sm $spacing-xs;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    transition: all $transition-fast;

    &:active {
      transform: scale(0.95);
    }
  }

  &__quick-icon {
    width: 96rpx;
    height: 96rpx;
    border-radius: 24rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-xs;
  }

  &__quick-emoji {
    font-size: 48rpx;
  }

  &__quick-label {
    font-size: $font-xs;
    color: $text-primary;
    text-align: center;
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>