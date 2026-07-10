<!--
  课程详情 - R-1401
-->
<template>
  <view class="lesson-detail">
    <view v-if="loading" class="lesson-detail__loading">
      <view class="lesson-detail__loading-circle" />
      <text>加载中...</text>
    </view>

    <scroll-view v-else-if="lesson" scroll-y class="lesson-detail__body">
      <view class="lesson-detail__hero">
        <view class="lesson-detail__hero-bg lesson-detail__hero-bg--1" />
        <view class="lesson-detail__hero-bg lesson-detail__hero-bg--2" />
        <view class="lesson-detail__hero-content">
          <text class="lesson-detail__emoji">📚</text>
          <text class="lesson-detail__title">
            {{ lesson.courseInstance?.name || lesson.subject?.name || '课程' }}
          </text>
          <view class="lesson-detail__tags">
            <view v-if="lesson.status" class="tag" :class="statusClass(lesson.status)">
              <text>{{ statusLabel(lesson.status) }}</text>
            </view>
            <view v-if="isTrial" class="tag tag-warn">
              <text>试听</text>
            </view>
          </view>
        </view>
      </view>

      <view class="lesson-detail__info">
        <view class="lesson-detail__row">
          <text class="lesson-detail__label">⏰ 时间</text>
          <text class="lesson-detail__value">{{ formatDateTime(lesson.plannedStartTime) }}</text>
        </view>
        <view class="lesson-detail__row">
          <text class="lesson-detail__label">⏱ 时长</text>
          <text class="lesson-detail__value">{{ durationLabel }}</text>
        </view>
        <view class="lesson-detail__row">
          <text class="lesson-detail__label">👨‍🏫 老师</text>
          <text class="lesson-detail__value">{{ lesson.teacher?.realName || '待定' }}</text>
        </view>
        <view class="lesson-detail__row">
          <text class="lesson-detail__label">📍 教室</text>
          <text class="lesson-detail__value">{{ lesson.room?.name || '待定' }}</text>
        </view>
        <view v-if="lesson.lessonNo" class="lesson-detail__row">
          <text class="lesson-detail__label">📖 课次</text>
          <text class="lesson-detail__value">第 {{ lesson.lessonNo }} 节</text>
        </view>
      </view>

      <view v-if="lesson.remark || lesson.note" class="lesson-detail__section">
        <text class="lesson-detail__section-title">📝 备注</text>
        <view class="lesson-detail__section-content">
          <text>{{ lesson.remark || lesson.note }}</text>
        </view>
      </view>

      <!-- 考勤信息 -->
      <view v-if="attendance" class="lesson-detail__section">
        <text class="lesson-detail__section-title">📋 我的考勤</text>
        <view class="lesson-detail__section-content">
          <view class="lesson-detail__attendance">
            <view class="tag" :class="attendanceClass">
              <text>{{ attendanceLabel }}</text>
            </view>
            <text v-if="attendance.actualStartTime" class="lesson-detail__attendance-time">
              实际: {{ formatTime(attendance.actualStartTime) }} - {{ formatTime(attendance.actualEndTime) }}
            </text>
          </view>

          <!--
            2026-07-09: 老师评语 — evaluation 是结构化对象 { score, content, strengths, improvements, evaluatedBy, evaluatedAt }。
            老版本 {{ attendance.evaluation }} 直接 stringify 渲染 JSON, 用户体验差。
            改成卡片化展示: 评分 (★) / 评语 / 亮点 / 待改进 / 评价人 / 评价时间。
            各字段均独立判定 (v-if), 老师没填的部分不显示空标签, 不堆"暂无"。
            shape 对齐 packages/admin/src/views/lessonSchedule/AttendanceListPage.vue 的 evalDialog。
          -->
          <view v-if="attendance.evaluation && attendance.evaluation.evaluatedAt" class="lesson-detail__eval">
            <view class="lesson-detail__eval-header">
              <text class="lesson-detail__eval-title">💬 老师评语</text>
              <view v-if="attendance.evaluation.score" class="lesson-detail__eval-score">
                <text
                  v-for="n in 5"
                  :key="n"
                  class="lesson-detail__star"
                  :class="{ 'is-on': n <= attendance.evaluation.score }"
                >★</text>
                <text class="lesson-detail__eval-score-text">{{ attendance.evaluation.score }}/5</text>
              </view>
            </view>

            <view v-if="attendance.evaluation.content" class="lesson-detail__eval-item">
              <text class="lesson-detail__eval-label">📝 评语</text>
              <text class="lesson-detail__eval-text">{{ attendance.evaluation.content }}</text>
            </view>

            <view v-if="attendance.evaluation.strengths" class="lesson-detail__eval-item">
              <text class="lesson-detail__eval-label">🌟 亮点</text>
              <text class="lesson-detail__eval-text">{{ attendance.evaluation.strengths }}</text>
            </view>

            <view v-if="attendance.evaluation.improvements" class="lesson-detail__eval-item">
              <text class="lesson-detail__eval-label">🎯 待改进</text>
              <text class="lesson-detail__eval-text">{{ attendance.evaluation.improvements }}</text>
            </view>

            <view class="lesson-detail__eval-footer">
              <text v-if="evaluationByName" class="lesson-detail__eval-meta">
                评价人：{{ evaluationByName }}
              </text>
              <text v-if="attendance.evaluation.evaluatedAt" class="lesson-detail__eval-meta">
                {{ formatDateTime(attendance.evaluation.evaluatedAt) }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 关联作品 -->
      <view v-if="works && works.length" class="lesson-detail__section">
        <text class="lesson-detail__section-title">🎨 本次作品</text>
        <scroll-view scroll-x class="lesson-detail__works-scroll">
          <view class="lesson-detail__works-list">
            <view v-for="w in works" :key="w._id" class="lesson-detail__work press" @tap="goWork(w._id)">
              <image
                v-for="(url, i) in (w.fileUrls || []).slice(0, 1)"
                :key="i"
                class="lesson-detail__work-img"
                :src="url"
                mode="aspectFill"
              />
              <view v-if="!w.fileUrls || !w.fileUrls.length" class="lesson-detail__work-empty">
                <text>🎨</text>
              </view>
              <text class="lesson-detail__work-title">{{ w.title || '作品' }}</text>
            </view>
          </view>
        </scroll-view>
      </view>
    </scroll-view>

    <view v-else class="lesson-detail__empty">
      <view class="lesson-detail__empty-art">
        <text>🤔</text>
      </view>
      <text>课程信息不存在</text>
    </view>
  </view>
</template>

<script>
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { date } from '@/utils/date'
import { AttendanceStatusLabel, AttendanceStatusColor } from '@/utils/constants'

export default {
  data() {
    return {
      loading: true,
      lesson: null,
      attendance: null,
      works: [],
      isTrial: false
    }
  },
  computed: {
    durationLabel() {
      if (!this.lesson?.plannedStartTime || !this.lesson?.plannedEndTime) return ''
      const min = Math.round(
        (new Date(this.lesson.plannedEndTime) - new Date(this.lesson.plannedStartTime)) / 60000
      )
      return min + ' 分钟'
    },
    attendanceLabel() {
      return AttendanceStatusLabel[this.attendance?.status] || ''
    },
    attendanceClass() {
      const c = AttendanceStatusColor[this.attendance?.status]
      if (c === '#7CD9B7') return 'tag-success'
      if (c === '#FF6B6B') return 'tag-warn'
      if (c === '#F5C148') return 'tag-gold'
      if (c === '#B89AE6') return 'tag-purple'
      return 'tag-info'
    },
    // 2026-07-09: 评价人 — evaluatedBy 在 evaluation 子文档里 (不是顶层字段),
    //   后端 populate 'evaluation.evaluatedBy' 后是 {realName, mobile} 对象 / ObjectId 字符串 / null,
    //   三种形态都兼容; 都没有则空串, 模板里 v-if 不渲染整行。
    evaluationByName() {
      const by = this.attendance?.evaluation?.evaluatedBy
      if (!by) return ''
      if (typeof by === 'string') return ''
      return by.realName || by.mobile || ''
    }
  },
  onLoad(query) {
    this.id = query.id
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const lesson = await lessonScheduleApi.detail(this.id)
        this.lesson = lesson
        this.isTrial = !!lesson.isTrialLesson
        // 拉我的考勤 (active student 上下文)
        try {
          const attendances = await lessonAttendanceApi.list({ lessonSchedule: this.id })
          const list = Array.isArray(attendances) ? attendances : attendances.items || attendances.data || []
          if (list.length) {
            this.attendance = list[0]
            // 拉作品
            try {
              const w = await lessonAttendanceApi.works(list[0]._id || list[0].id)
              this.works = Array.isArray(w) ? w : w.items || w.data || []
            } catch (_) {}
          }
        } catch (_) {}
      } catch (e) {
        this.lesson = null
      } finally {
        this.loading = false
      }
    },
    formatDateTime: (d) => (d ? date.fmt(d) : ''),
    formatTime: (d) => (d ? date.fmtTime(d) : ''),
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
    goWork(id) {
      uni.navigateTo({ url: `/pages/work/detail?id=${id}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.lesson-detail {
  min-height: 100vh;
  background: $bg-page;

  &__loading {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    color: $text-secondary;
  }

  &__loading-circle {
    width: 80rpx;
    height: 80rpx;
    border: 6rpx solid $divider;
    border-top-color: $primary;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: $spacing-md;
  }

  &__body {
    padding-bottom: $spacing-2xl;
  }

  &__hero {
    padding: $spacing-2xl $spacing-md $spacing-xl;
    background: linear-gradient(180deg, #FFB088 0%, $bg-page 100%);
    position: relative;
    overflow: hidden;
  }

  &__hero-bg {
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
      top: 60rpx;
      left: -40rpx;
      animation-delay: 1.5s;
    }
  }

  &__hero-content {
    position: relative;
    @include flex-center;
    flex-direction: column;
  }

  &__emoji {
    font-size: 96rpx;
    margin-bottom: $spacing-md;
    filter: drop-shadow(0 8rpx 24rpx rgba(255, 138, 101, 0.32));
  }

  &__title {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    text-align: center;
    margin-bottom: $spacing-sm;
  }

  &__tags {
    display: flex;
    gap: $spacing-xs;
  }

  &__info {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    margin: $spacing-md;
    box-shadow: $shadow-card;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-sm 0;
    border-bottom: 1rpx solid $divider-light;

    &:last-child {
      border-bottom: none;
    }
  }

  &__label {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__value {
    font-size: $font-sm;
    color: $text-primary;
    font-weight: $font-weight-medium;
    text-align: right;
    flex: 1;
    margin-left: $spacing-md;
  }

  &__section {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    margin: 0 $spacing-md $spacing-md;
    box-shadow: $shadow-card;
  }

  &__section-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  &__section-content {
    font-size: $font-sm;
    color: $text-primary;
    line-height: 1.6;
  }

  &__attendance {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__attendance-time {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__eval {
    margin-top: $spacing-md;
    padding-top: $spacing-md;
    border-top: 1rpx solid $divider-light;
  }

  &__eval-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-sm;
  }

  &__eval-title {
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  &__eval-score {
    display: flex;
    align-items: center;
    gap: 2rpx;
  }

  &__star {
    font-size: $font-base;
    color: $divider;
    &.is-on { color: #F5C148; }
  }

  &__eval-score-text {
    margin-left: $spacing-xs;
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__eval-item {
    margin-bottom: $spacing-sm;
  }

  &__eval-label {
    display: block;
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }

  &__eval-text {
    display: block;
    font-size: $font-sm;
    color: $text-primary;
    line-height: 1.7;
    white-space: pre-wrap;
    word-break: break-word;
  }

  &__eval-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: $spacing-sm;
    padding-top: $spacing-sm;
    border-top: 1rpx dashed $divider-light;
  }

  &__eval-meta {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__works-scroll {
    margin: 0 (-$spacing-md);
    padding: 0 $spacing-md;
  }

  &__works-list {
    display: inline-flex;
    gap: $spacing-sm;
    padding: $spacing-xs 0;
  }

  &__work {
    width: 240rpx;
    background: $bg-page;
    border-radius: $radius-sm;
    overflow: hidden;
  }

  &__work-img {
    width: 240rpx;
    height: 180rpx;
    display: block;
  }

  &__work-empty {
    width: 240rpx;
    height: 180rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: $divider-light;
    font-size: 64rpx;
  }

  &__work-title {
    display: block;
    padding: $spacing-xs;
    font-size: $font-xs;
    color: $text-primary;
    text-align: center;
  }

  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    text-align: center;
  }

  &__empty-art {
    width: 200rpx;
    height: 200rpx;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 96rpx;
    margin-bottom: $spacing-md;
  }
}
</style>