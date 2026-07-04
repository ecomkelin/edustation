<!--
  CourseInstance 详情 - C 端 (家长视角)
  2026-07-02 实现: 课程名 + 状态 + 3 KPI (已上/计划总/剩余) + 学习目标 + 简介 + 折叠大纲
  数据源: R-1101 /course-instances/:id (详情) + R-1215 /course-enrollments/me/by-instance/:id (个人进度)
-->
<template>
  <view class="course-detail">
    <!-- 加载态 -->
    <view v-if="loading" class="course-detail__loading">
      <text>召唤中…</text>
    </view>

    <!-- 异常态 -->
    <view v-else-if="loadError" class="course-detail__error">
      <text class="course-detail__error-emoji">😢</text>
      <text class="course-detail__error-title">加载失败</text>
      <text class="course-detail__error-desc">{{ loadError }}</text>
      <view class="course-detail__error-retry press" @tap="load">
        <text>重试</text>
      </view>
    </view>

    <scroll-view v-else-if="course" scroll-y class="course-detail__body">
      <view class="course-detail__body-inner">
        <!-- 顶部 hero: 课程名 + 状态 tag -->
        <view class="course-detail__hero">
          <view class="course-detail__hero-emoji">
            <text>{{ subjectEmoji }}</text>
          </view>
          <view class="course-detail__hero-info">
            <text class="course-detail__hero-name">{{ course.name }}</text>
            <view class="course-detail__hero-status" :class="'course-detail__hero-status--' + course.status">
              <text>{{ statusLabel(course.status) }}</text>
            </view>
            <text v-if="course.subject?.name" class="course-detail__hero-subject">{{ course.subject.name }}</text>
          </view>
        </view>

        <!-- 老师 / 教室 (从 courseInstance populate) -->
        <view v-if="course.teacher?.realName || course.room?.name" class="course-detail__meta">
          <text v-if="course.teacher?.realName">👨‍🏫 {{ course.teacher.realName }}</text>
          <text v-if="course.room?.name">📍 {{ course.room.name }}</text>
        </view>

        <!-- 3 KPI 横排 + 进度环 -->
        <view class="course-detail__kpis">
          <view class="course-detail__kpi">
            <text class="course-detail__kpi-val course-detail__kpi-val--primary">{{ progress.attendedCount || 0 }}</text>
            <text class="course-detail__kpi-lbl">已上课时</text>
          </view>
          <view class="course-detail__kpi-divider" />
          <view class="course-detail__kpi">
            <text class="course-detail__kpi-val">{{ progress.scheduledCount || 0 }}</text>
            <text class="course-detail__kpi-lbl">计划总课时</text>
          </view>
          <view class="course-detail__kpi-divider" />
          <view class="course-detail__kpi">
            <text class="course-detail__kpi-val course-detail__kpi-val--orange">{{ progress.remainingScheduled || 0 }}</text>
            <text class="course-detail__kpi-lbl">剩余课时</text>
          </view>
        </view>

        <!-- 进度环 (SVG) + 文字 -->
        <view class="course-detail__progress">
          <view class="course-detail__ring">
            <svg :width="ringSize" :height="ringSize" :viewBox="'0 0 ' + ringSize + ' ' + ringSize">
              <circle
                :cx="ringSize / 2"
                :cy="ringSize / 2"
                :r="ringRadius"
                fill="none"
                stroke="rgba(255, 138, 101, 0.15)"
                :stroke-width="ringStroke"
              />
              <circle
                :cx="ringSize / 2"
                :cy="ringSize / 2"
                :r="ringRadius"
                fill="none"
                stroke="#FF8A65"
                :stroke-width="ringStroke"
                stroke-linecap="round"
                :stroke-dasharray="ringCircumference"
                :stroke-dashoffset="ringOffset"
                :transform="'rotate(-90 ' + (ringSize / 2) + ' ' + (ringSize / 2) + ')'"
              />
            </svg>
            <view class="course-detail__ring-text">
              <text class="course-detail__ring-pct">{{ progress.attendanceRate || 0 }}%</text>
              <text class="course-detail__ring-lbl">出勤率</text>
            </view>
          </view>
          <view class="course-detail__progress-info">
            <text class="course-detail__progress-title">课程进度</text>
            <text class="course-detail__progress-desc">
              共 {{ progress.scheduledCount || 0 }} 节课, 已上 {{ progress.attendedCount || 0 }} 节,
              剩余 {{ progress.remainingScheduled || 0 }} 节
            </text>
            <text v-if="progress.lastAttendedAt" class="course-detail__progress-last">
              上次考勤: 第 {{ progress.lastLessonNo }} 节 · {{ formatDate(progress.lastAttendedAt) }}
            </text>
          </view>
        </view>

        <!-- 学习目标 (Subject.objectives[]) -->
        <view v-if="objectives.length" class="course-detail__card">
          <text class="course-detail__card-title">🎯 学习目标</text>
          <view class="course-detail__objectives">
            <view
              v-for="(o, i) in objectives"
              :key="i"
              class="course-detail__objective"
            >
              <text class="course-detail__objective-check">✓</text>
              <text class="course-detail__objective-text">{{ o }}</text>
            </view>
          </view>
        </view>

        <!-- 课程简介 (subject.description) -->
        <view v-if="course.subject?.description" class="course-detail__card">
          <text class="course-detail__card-title">📖 课程简介</text>
          <text class="course-detail__desc">
            {{ descExpanded ? course.subject.description : truncateDesc }}
          </text>
          <view v-if="course.subject.description.length > 200" class="course-detail__desc-toggle press" @tap="descExpanded = !descExpanded">
            <text>{{ descExpanded ? '收起' : '展开全文' }} ›</text>
          </view>
        </view>

        <!-- 课程大纲 (折叠面板) -->
        <view v-if="syllabusLessons.length" class="course-detail__card">
          <text class="course-detail__card-title">📚 课程大纲 ({{ syllabusLessons.length }} 节)</text>
          <view class="course-detail__syllabus">
            <view
              v-for="l in syllabusLessons"
              :key="l.lessonNo"
              class="course-detail__lesson"
              :class="{ 'course-detail__lesson--attended': isAttended(l.lessonNo) }"
            >
              <view class="course-detail__lesson-header press" @tap="toggleLesson(l.lessonNo)">
                <view class="course-detail__lesson-no">
                  <text>{{ l.lessonNo }}</text>
                </view>
                <view class="course-detail__lesson-info">
                  <text class="course-detail__lesson-topic">{{ l.topic }}</text>
                  <view class="course-detail__lesson-meta">
                    <text v-if="l.durationMinutes">⏱ {{ l.durationMinutes }} 分钟</text>
                    <text v-if="isAttended(l.lessonNo)" class="course-detail__lesson-mark">✓ 已上</text>
                  </view>
                </view>
                <text class="course-detail__lesson-chevron">{{ expandedSet.has(l.lessonNo) ? '▾' : '▸' }}</text>
              </view>
              <view v-if="expandedSet.has(l.lessonNo)" class="course-detail__lesson-body">
                <text v-if="l.description" class="course-detail__lesson-desc">{{ l.description }}</text>
                <view v-if="l.objectives && l.objectives.length" class="course-detail__lesson-objectives">
                  <text class="course-detail__lesson-objectives-title">本节目标:</text>
                  <text
                    v-for="(o, i) in l.objectives"
                    :key="i"
                    class="course-detail__lesson-objective"
                  >· {{ o }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 2026-07-04 新增 (R-1493): 本孩子的考勤记录 - 点击进 schedule/detail -->
        <view v-if="schedules.length" class="course-detail__card">
          <view class="course-detail__card-header">
            <text class="course-detail__card-title">📋 考勤记录</text>
            <text class="course-detail__card-stat">{{ attendanceCounts.done }}/{{ schedules.length }} 节已上</text>
          </view>
          <view class="course-detail__attendances">
            <view
              v-for="s in schedules"
              :key="s.id"
              class="course-detail__att-row press"
              @tap="goSchedule(s)"
            >
              <view class="course-detail__att-no">
                <text>{{ s.lessonNo }}</text>
              </view>
              <view class="course-detail__att-body">
                <view class="course-detail__att-top">
                  <text class="course-detail__att-title">第 {{ s.lessonNo }} 节</text>
                  <view
                    class="course-detail__att-tag"
                    :class="'course-detail__att-tag--' + attendanceUI(s).cls"
                  >
                    <text>{{ attendanceUI(s).label }}</text>
                  </view>
                </view>
                <view class="course-detail__att-meta">
                  <text v-if="formatDateShort(s.plannedStartTime)">📅 {{ formatDateShort(s.plannedStartTime) }}</text>
                  <text v-if="formatTime(s.plannedStartTime)">⏰ {{ formatTime(s.plannedStartTime) }}</text>
                  <text v-if="s.teacher?.realName">👨‍🏫 {{ s.teacher.realName }}</text>
                  <text v-if="s.room?.name">📍 {{ s.room.name }}</text>
                </view>
              </view>
              <text class="course-detail__att-arrow">›</text>
            </view>
          </view>
        </view>

        <view class="course-detail__bottom-spacer" />
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { courseInstanceApi } from '@/api/courseInstance'
import { courseEnrollmentApi } from '@/api/courseEnrollment'
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { date } from '@/utils/date'
import { haptic } from '@/utils/haptic'

const STATUS_MAP = {
  enrolling: { label: '招生中', cls: 'enrolling' },
  preparing: { label: '备课中', cls: 'preparing' },
  ongoing: { label: '进行中', cls: 'ongoing' },
  finished: { label: '已结课', cls: 'finished' },
  archived: { label: '已归档', cls: 'archived' },
  cancelled: { label: '已取消', cls: 'cancelled' }
}

// 2026-07-04: 考勤状态 → UI 文案 + 颜色,跟 admin 端 AttendanceStatusLabel/Color 对齐
const ATTENDANCE_UI = {
  scheduled:  { label: '待上课', cls: 'scheduled' },
  checked_in: { label: '进行中', cls: 'checked-in' },
  completed:  { label: '已上', cls: 'completed' },
  madeup:     { label: '已补课', cls: 'completed' },  // 跟 completed 视觉等价(均扣课时)
  no_show:    { label: '缺席', cls: 'no-show' },
  leave:      { label: '已请假', cls: 'leave' }
}

export default {
  data() {
    return {
      loading: true,
      loadError: '',
      courseInstanceId: '',
      course: null,
      progress: {},
      // 2026-07-04 加 (R-1493): 当前孩子在开班下所有排课+本学生考勤
      schedules: [],
      schedulesLoading: false,
      expandedSet: new Set(),       // 已展开的 lessonNo
      descExpanded: false,
      ringSize: 140,
      ringStroke: 12
    }
  },
  computed: {
    objectives() {
      return this.course?.subject?.objectives || []
    },
    syllabusLessons() {
      // 优先 syllabusSnapshot (开班快照), 否则用 subject.syllabus (实时)
      const snap = this.course?.syllabusSnapshot?.lessons
      if (snap && snap.length) return snap
      return this.course?.subject?.syllabus?.lessons || []
    },
    truncateDesc() {
      const d = this.course?.subject?.description || ''
      return d.length > 200 ? d.slice(0, 200) + '…' : d
    },
    subjectEmoji() {
      // 简单关键词映射, 没命中用课本 emoji
      const name = (this.course?.subject?.name || '').toLowerCase()
      if (/c\+\+|编程|程序|code|program/i.test(name)) return '💻'
      if (/python/i.test(name)) return '🐍'
      if (/机器人|robot/i.test(name)) return '🤖'
      if (/美术|画画|绘画|paint|art/i.test(name)) return '🎨'
      if (/音乐|piano|钢琴|music/i.test(name)) return '🎵'
      if (/数学|math/i.test(name)) return '🔢'
      if (/英语|english/i.test(name)) return '🔤'
      if (/科学|science/i.test(name)) return '🔬'
      return '📚'
    },
    ringRadius() {
      return (this.ringSize - this.ringStroke) / 2
    },
    ringCircumference() {
      return 2 * Math.PI * this.ringRadius
    },
    ringOffset() {
      const pct = (this.progress.attendanceRate || 0) / 100
      return this.ringCircumference * (1 - pct)
    },
    // 2026-07-04: 已上/总数 (走 attendance.status 而非 schedule.status,更准确)
    attendanceCounts() {
      const list = Array.isArray(this.schedules) ? this.schedules : []
      let done = 0
      for (const s of list) {
        const st = s.attendance && s.attendance.status
        if (st === 'completed' || st === 'madeup') done++
      }
      return { done, total: list.length }
    }
  },
  onLoad(options) {
    this.courseInstanceId = options.id || ''
    if (!this.courseInstanceId) {
      this.loadError = '缺少课程 ID'
      this.loading = false
      return
    }
  },
  onShow() {
    if (this.courseInstanceId) this.load()
  },
  methods: {
    async load() {
      this.loading = true
      this.loadError = ''
      try {
        // 并行调详情 + 个人进度 + 考勤列表
        // 2026-07-04 改: C 端用 /:id/me 旁路端点跳过 courseInstance.read 权限码 (家长没有这个权限码)
        // 之前 detail() 返回 403 "无权限: courseInstance.read";现在 me() 走 mws.activeStudent 校验该学生报名该开班
        // ref: R-1101A + [memory: c-end-me-endpoint-pattern]
        // 2026-07-04 增第三路 (R-1493): byInstance 拉本孩子在开班下的排课+考勤,失败也不影响首屏 KPI
        this.schedulesLoading = true
        const [course, progress, schedules] = await Promise.all([
          courseInstanceApi.me(this.courseInstanceId),
          courseEnrollmentApi.myProgress(this.courseInstanceId).catch(() => ({})),
          lessonScheduleApi.byInstance(this.courseInstanceId).catch((e) => {
            console.warn('[instance-detail.schedules]', e?.message)
            return []
          })
        ])
        this.course = course || null
        this.progress = progress?.progress || progress || {}
        this.schedules = Array.isArray(schedules) ? schedules : (schedules?.items || [])
        // 默认展开第 1 节
        if (this.syllabusLessons.length && this.expandedSet.size === 0) {
          this.expandedSet = new Set([this.syllabusLessons[0].lessonNo])
        }
      } catch (e) {
        console.warn('[course-detail.load]', e)
        this.loadError = e?.message || '加载失败'
        this.course = null
      } finally {
        this.loading = false
        this.schedulesLoading = false
      }
    },

    statusLabel(s) {
      return STATUS_MAP[s]?.label || s || '未知'
    },

    // 折叠切换
    toggleLesson(lessonNo) {
      haptic.tap()
      const next = new Set(this.expandedSet)
      if (next.has(lessonNo)) next.delete(lessonNo)
      else next.add(lessonNo)
      this.expandedSet = next
    },

    // 是否已上 (用 lastLessonNo 推断)
    isAttended(lessonNo) {
      const last = this.progress.lastLessonNo
      if (!last) return false
      return Number(lessonNo) <= Number(last)
    },

    formatDate(d) {
      if (!d) return ''
      try {
        return date.fmtDate(d)
      } catch (e) {
        return ''
      }
    },
    // 2026-07-04: 考勤 section 用
    formatDateShort(d) {
      if (!d) return ''
      try {
        const dt = new Date(d)
        const m = String(dt.getMonth() + 1).padStart(2, '0')
        const day = String(dt.getDate()).padStart(2, '0')
        const weekday = ['日', '一', '二', '三', '四', '五', '六'][dt.getDay()]
        return `${m}-${day} 周${weekday}`
      } catch (e) {
        return ''
      }
    },
    formatTime(d) {
      if (!d) return ''
      try {
        const dt = new Date(d)
        const hh = String(dt.getHours()).padStart(2, '0')
        const mm = String(dt.getMinutes()).padStart(2, '0')
        return `${hh}:${mm}`
      } catch (e) {
        return ''
      }
    },
    // schedule 行的状态 tag; attendance=null 时(刚生成排课未报/未消课)按 schedule.status 兜底
    attendanceUI(s) {
      const a = s && s.attendance
      if (a && a.status && ATTENDANCE_UI[a.status]) {
        return ATTENDANCE_UI[a.status]
      }
      // 没有考勤记录 — 看排课本身是否已上完(plannedEndTime < now)
      const st = s && s.status
      if (st === 'finished' || st === 'archived') {
        return { label: '已上', cls: 'completed' }
      }
      if (st === 'in_progress') return { label: '进行中', cls: 'checked-in' }
      return { label: '待上课', cls: 'scheduled' }
    },
    goSchedule(s) {
      haptic.tap()
      if (!s || !s.id) return
      uni.navigateTo({ url: '/pages/schedule/detail?id=' + s.id })
    }
  }
}
</script>

<style lang="scss" scoped>
.course-detail {
  min-height: 100vh;
  background: $bg-page;

  &__loading {
    @include flex-center;
    padding: $spacing-2xl;
    color: $text-secondary;
  }

  &__error {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
  }
  &__error-emoji { font-size: 96rpx; margin-bottom: $spacing-md; }
  &__error-title { font-size: $font-lg; color: $text-primary; margin-bottom: $spacing-sm; }
  &__error-desc { font-size: $font-sm; color: $text-tertiary; margin-bottom: $spacing-lg; }
  &__error-retry {
    padding: $spacing-sm $spacing-lg;
    background: $primary;
    color: #fff;
    border-radius: $radius-pill;
    font-size: $font-sm;
  }

  &__body {
    height: 100vh;
  }
  // 2026-07-02: scroll-view 在 H5 下 padding 不传子, wrapper 承载
  &__body-inner {
    padding: 0 $spacing-lg;
  }

  // hero
  &__hero {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    padding: $spacing-lg $spacing-md;
    margin: $spacing-md 0;
    background: linear-gradient(135deg, $primary-lighter, #FFE4D3);
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }
  &__hero-emoji {
    width: 96rpx;
    height: 96rpx;
    background: $bg-card;
    border-radius: 24rpx;
    @include flex-center;
    font-size: 56rpx;
    flex-shrink: 0;
  }
  &__hero-info {
    flex: 1;
    min-width: 0;
  }
  &__hero-name {
    display: block;
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: 8rpx;
  }
  &__hero-status {
    display: inline-block;
    padding: 4rpx 12rpx;
    font-size: $font-xs;
    border-radius: $radius-pill;
    background: rgba(255, 255, 255, 0.7);
    color: $text-secondary;
    margin-bottom: 8rpx;
  }
  &__hero-status--preparing { background: rgba(255, 200, 87, 0.2); color: #B07A00; }
  &__hero-status--ongoing { background: rgba(124, 217, 183, 0.2); color: #1F8C66; }
  &__hero-status--finished { background: rgba(0, 0, 0, 0.08); color: $text-tertiary; }
  &__hero-status--enrolling { background: rgba(91, 158, 230, 0.2); color: #2D5F9F; }
  &__hero-subject {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__meta {
    display: flex;
    gap: $spacing-md;
    padding: 0 $spacing-sm;
    margin-bottom: $spacing-md;
    font-size: $font-sm;
    color: $text-secondary;
  }

  // KPI 3 列
  &__kpis {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }
  &__kpi {
    flex: 1;
    text-align: center;
  }
  &__kpi-val {
    display: block;
    font-size: 48rpx;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.2;
  }
  &__kpi-val--primary { color: $primary; }
  &__kpi-val--orange { color: #F5A148; }
  &__kpi-lbl {
    display: block;
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 4rpx;
  }
  &__kpi-divider {
    width: 1rpx;
    height: 56rpx;
    background: $divider;
  }

  // 进度环
  &__progress {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }
  &__ring {
    position: relative;
    flex-shrink: 0;
  }
  &__ring-text {
    position: absolute;
    inset: 0;
    @include flex-center;
    flex-direction: column;
  }
  &__ring-pct {
    font-size: 36rpx;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1;
  }
  &__ring-lbl {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 4rpx;
  }
  &__progress-info {
    flex: 1;
    min-width: 0;
  }
  &__progress-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 8rpx;
  }
  &__progress-desc {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: 6rpx;
    line-height: 1.5;
  }
  &__progress-last {
    display: block;
    font-size: $font-xs;
    color: $text-tertiary;
  }

  // 通用 card
  &__card {
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }
  &__card-title {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  // 学习目标
  &__objectives {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }
  &__objective {
    display: flex;
    align-items: flex-start;
    gap: $spacing-sm;
  }
  &__objective-check {
    flex-shrink: 0;
    width: 32rpx;
    height: 32rpx;
    background: $primary-lighter;
    color: $primary;
    border-radius: 50%;
    @include flex-center;
    font-size: $font-xs;
    font-weight: $font-weight-bold;
    margin-top: 2rpx;
  }
  &__objective-text {
    flex: 1;
    font-size: $font-sm;
    color: $text-primary;
    line-height: 1.6;
  }

  // 简介
  &__desc {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.7;
    white-space: pre-wrap;
  }
  &__desc-toggle {
    margin-top: $spacing-sm;
    text-align: center;
    font-size: $font-sm;
    color: $primary;
  }

  // 课程大纲
  &__syllabus {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }
  &__lesson {
    border: 1rpx solid $divider;
    border-radius: $radius-md;
    overflow: hidden;
    background: $bg-page;

    &--attended {
      background: rgba(124, 217, 183, 0.08);
      border-color: rgba(124, 217, 183, 0.3);
    }
  }
  &__lesson-header {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    padding: $spacing-sm $spacing-md;
  }
  &__lesson-no {
    width: 56rpx;
    height: 56rpx;
    background: $bg-card;
    color: $text-secondary;
    border-radius: 50%;
    @include flex-center;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    flex-shrink: 0;
    box-shadow: $shadow-card;

    .course-detail__lesson--attended & {
      background: $primary;
      color: #fff;
    }
  }
  &__lesson-info {
    flex: 1;
    min-width: 0;
  }
  &__lesson-topic {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__lesson-meta {
    display: flex;
    gap: $spacing-sm;
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__lesson-mark {
    color: #1F8C66;
    font-weight: $font-weight-semibold;
  }
  &__lesson-chevron {
    color: $text-tertiary;
    font-size: $font-base;
    flex-shrink: 0;
  }
  &__lesson-body {
    padding: 0 $spacing-md $spacing-sm 84rpx;
    border-top: 1rpx solid $divider;
    background: rgba(255, 255, 255, 0.5);
  }
  &__lesson-desc {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.6;
    margin: $spacing-sm 0;
  }
  &__lesson-objectives {
    padding: $spacing-sm;
    background: rgba(255, 138, 101, 0.05);
    border-radius: $radius-sm;
    margin-top: $spacing-sm;
  }
  &__lesson-objectives-title {
    display: block;
    font-size: $font-xs;
    font-weight: $font-weight-semibold;
    color: $primary;
    margin-bottom: 4rpx;
  }
  &__lesson-objective {
    display: block;
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.6;
  }

  &__bottom-spacer {
    height: $spacing-2xl;
  }

  // 2026-07-04: 考勤记录 section
  &__card-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: $spacing-sm;
  }
  &__card-title {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    // 此处不复写 margin - 已有 card 类的 margin-bottom;header 内的 title 不重复
    margin-bottom: 0;
  }
  &__card-stat {
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__attendances {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }
  &__att-row {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
    padding: $spacing-sm $spacing-md;
    background: $bg-page;
    border-radius: $radius-md;
    border: 1rpx solid $divider;

    &:active {
      background: rgba(255, 138, 101, 0.06);
    }
  }
  &__att-no {
    width: 56rpx;
    height: 56rpx;
    background: $bg-card;
    color: $text-secondary;
    border-radius: 50%;
    @include flex-center;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    flex-shrink: 0;
    box-shadow: $shadow-card;
  }
  &__att-body {
    flex: 1;
    min-width: 0;
  }
  &__att-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8rpx;
    margin-bottom: 6rpx;
  }
  &__att-title {
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
  &__att-tag {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    padding: 4rpx 12rpx;
    font-size: $font-xs;
    border-radius: $radius-pill;
    background: $divider-light;
    color: $text-secondary;

    &--completed {
      background: rgba(124, 217, 183, 0.20);
      color: #1F8C66;
    }
    &--checked-in {
      background: rgba(91, 158, 230, 0.20);
      color: #2D5F9F;
    }
    &--scheduled {
      background: rgba(255, 138, 101, 0.18);
      color: $primary;
    }
    &--no-show {
      background: rgba(255, 107, 107, 0.20);
      color: #D44141;
    }
    &--leave {
      background: rgba(0, 0, 0, 0.06);
      color: $text-tertiary;
    }
  }
  &__att-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6rpx 14rpx;
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__att-arrow {
    color: $text-tertiary;
    font-size: 36rpx;
    flex-shrink: 0;
    line-height: 1;
  }
}
</style>