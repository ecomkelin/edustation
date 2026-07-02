<!--
  上传作品 - 2026-07-01 实装
  三步走：选考勤 → 选文件 + 填标题 → 提交
  文件走 uni.chooseMedia → 循环 /storage/upload?scope=work 拿到 fileIds → POST /student-works
-->
<template>
  <view class="upload">
    <view v-if="loading" class="upload__loading">
      <text>加载中…</text>
    </view>

    <scroll-view v-else scroll-y class="upload__body">
      <!-- Step 1: 选考勤 -->
      <view class="upload__section">
        <view class="upload__label">
          <text class="upload__label-text">课程考勤</text>
          <text class="upload__label-required">*</text>
        </view>

        <view v-if="!attendances.length && !loading" class="upload__empty">
          <text>暂无可以上传作品的考勤</text>
          <text class="upload__empty-tip">（已结束的课或排好队的课）</text>
        </view>

        <view v-else class="upload__attendance-list">
          <view
            v-for="a in attendances"
            :key="a._id"
            class="upload__attendance press"
            :class="{ 'upload__attendance--active': form.lessonAttendance === a._id }"
            @tap="pickAttendance(a)"
          >
            <view class="upload__attendance-icon">
              <text>{{ statusEmoji(a.status) }}</text>
            </view>
            <view class="upload__attendance-info">
              <view class="upload__attendance-title">
                <text>{{ a.lessonSchedule && a.lessonSchedule.title || '课程' }}</text>
              </view>
              <view class="upload__attendance-meta">
                <text>{{ a.lessonSchedule && a.lessonSchedule.plannedStartTime ? date.fmt(a.lessonSchedule.plannedStartTime) : '时间待定' }}</text>
                <text class="upload__attendance-status">{{ statusCN(a.status) }}</text>
              </view>
            </view>
            <view v-if="form.lessonAttendance === a._id" class="upload__attendance-check">
              <text>✓</text>
            </view>
          </view>
        </view>
      </view>

      <!-- Step 2: 文件 + 标题 / 描述 / 等级 -->
      <view v-if="form.lessonAttendance" class="upload__section">
        <view class="upload__label">
          <text class="upload__label-text">作品文件</text>
          <text class="upload__label-required">*</text>
        </view>

        <view class="upload__file-grid">
          <view
            v-for="(f, i) in form.localFiles"
            :key="i"
            class="upload__file press"
          >
            <image
              v-if="!isVideoPath(f.path)"
              class="upload__file-img"
              :src="f.path"
              mode="aspectFill"
            />
            <view v-else class="upload__file-video">
              <text>▶</text>
              <text class="upload__file-videotip">视频</text>
            </view>
            <view class="upload__file-remove" @tap.stop="removeFile(i)">
              <text>×</text>
            </view>
            <view v-if="uploadingIdx === i" class="upload__file-uploading">
              <text>上传中…</text>
            </view>
          </view>

          <view v-if="form.localFiles.length < 9" class="upload__file-add press" @tap="onChooseMedia">
            <text class="upload__file-add-plus">＋</text>
            <text class="upload__file-add-tip">相册 / 拍摄</text>
          </view>
        </view>

        <view class="upload__form-tip">
          <text>支持图片 / 视频 / 音频 / PDF，最多 9 个</text>
        </view>
      </view>

      <view v-if="form.lessonAttendance && form.localFiles.length" class="upload__section">
        <view class="upload__label">
          <text class="upload__label-text">标题</text>
          <text class="upload__label-required">*</text>
        </view>
        <input
          v-model="form.title"
          class="upload__input"
          placeholder="如：水墨山水-第一节"
          maxlength="100"
        />

        <view class="upload__label" style="margin-top: 24rpx">
          <text class="upload__label-text">描述</text>
        </view>
        <textarea
          v-model="form.description"
          class="upload__textarea"
          placeholder="创作思路 / 老师说点啥"
          auto-height
          maxlength="-1"
        />

        <view class="upload__label" style="margin-top: 24rpx">
          <text class="upload__label-text">等级</text>
        </view>
        <view class="upload__level">
          <view
            v-for="lv in [1,2,3,4,5]"
            :key="lv"
            class="upload__level-star press"
            :class="{ 'upload__level-star--active': form.level === lv }"
            @tap="pickLevel(lv)"
          >
            <text>{{ form.level >= lv ? '★' : '☆' }}</text>
          </view>
          <view class="upload__level-clear press" @tap="pickLevel(0)">
            <text>不清评</text>
          </view>
        </view>
      </view>
    </scroll-view>

    <!-- 底部固定提交按钮 -->
    <view v-if="form.lessonAttendance && form.localFiles.length" class="upload__footer">
      <view class="upload__submit press" :class="{ 'upload__submit--disabled': submitting }" @tap="submit">
        <text>{{ submitting ? '提交中…' : '提交作品' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { studentWorkApi } from '@/api/studentWork'
import { lessonAttendanceApi } from '@/api/lessonAttendance'
import { storageApi } from '@/api/storage'
import { useStudentStore } from '@/stores/student'
import { date } from '@/utils/date'

const STATUS_CN = {
  scheduled: '已排课',
  checked_in: '已签到',
  arrived: '已到课',
  completed: '已完成',
  madeup: '已补课',
  leave: '请假',
  no_show: '缺席'
}
const STATUS_EMOJI = {
  scheduled: '📅',
  checked_in: '✓',
  arrived: '👋',
  completed: '✅',
  madeup: '🔁',
  leave: '📝',
  no_show: '✗'
}

export default {
  data() {
    return {
      loading: true,
      attending: false,
      submitting: false,
      uploadingIdx: -1,
      attendances: [],
      form: {
        lessonAttendance: '',
        title: '',
        description: '',
        level: 0,
        localFiles: [] // [{ path, uploaded: false, fileId: null }]
      }
    }
  },
  computed: {
    studentId() {
      return useStudentStore().activeStudentId
    },
    canSubmit() {
      return !!(
        this.form.lessonAttendance &&
        String(this.form.title).trim() &&
        this.form.localFiles.length
      )
    }
  },
  onLoad() {
    this.loadAttendances()
  },
  methods: {
    statusCN(s) { return STATUS_CN[s] || s || '' },
    statusEmoji(s) { return STATUS_EMOJI[s] || '📌' },
    isVideoPath(p) {
      return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i.test(p || '')
    },
    async loadAttendances() {
      this.loading = true
      try {
        const res = await lessonAttendanceApi.me({ pageSize: 50 })
        // 后端返业务 data；此处可能是数组或 {items}
        const arr = Array.isArray(res) ? res : (Array.isArray(res?.items) ? res.items : [])
        this.attendances = arr.filter((a) => !this.isMine(a)) || arr
        // 默认按 studentId 过滤已在后端完成, 直接使用
        this.attendances = arr
      } catch (e) {
        this.attendances = []
      } finally {
        this.loading = false
      }
    },
    isMine(a) {
      // activeStudentId 已是后端过滤；这里仅作为界面提示（学生姓名匹配校验，非强制）
      const me = useStudentStore().activeStudent
      if (!me || !a.student) return false
      return String(a.student._id || a.student.id) !== String(me.id)
    },
    pickAttendance(a) {
      this.form.lessonAttendance = a._id
    },
    pickLevel(lv) {
      this.form.level = this.form.level === lv ? 0 : lv
    },
    onChooseMedia() {
      const remain = 9 - this.form.localFiles.length
      if (remain <= 0) {
        uni.showToast({ title: '最多 9 个文件', icon: 'none' })
        return
      }
      uni.chooseMedia({
        count: remain,
        mediaType: ['image', 'video'],
        sourceType: ['album', 'camera'],
        success: (res) => {
          const files = (res.tempFiles || res.tempFilePaths || []).map((f) => ({
            path: f.tempFilePath || f.path,
            uploaded: false,
            fileId: null
          }))
          this.form.localFiles = [...this.form.localFiles, ...files]
        },
        fail: (e) => {
          uni.showToast({ title: e.errMsg || '选择失败', icon: 'none' })
        }
      })
    },
    removeFile(i) {
      this.form.localFiles.splice(i, 1)
    },
    async uploadAll() {
      const ids = []
      for (let i = 0; i < this.form.localFiles.length; i++) {
        const f = this.form.localFiles[i]
        if (f.uploaded && f.fileId) {
          ids.push(f.fileId)
          continue
        }
        this.uploadingIdx = i
        try {
          const res = await storageApi.upload(f.path, { formData: {} })
          const data = res && res.data ? res.data : res
          const fid = (data && data.id) || (data && data._id)
          if (!fid) throw new Error('未拿到 fileId')
          f.fileId = String(fid)
          f.uploaded = true
          ids.push(f.fileId)
        } catch (e) {
          this.uploadingIdx = -1
          throw e
        }
      }
      this.uploadingIdx = -1
      return ids
    },
    async submit() {
      if (!this.canSubmit || this.submitting) return
      this.submitting = true
      try {
        const fileIds = await this.uploadAll()
        if (!fileIds.length) {
          uni.showToast({ title: '请至少选择一个文件', icon: 'none' })
          return
        }
        const payload = {
          lessonAttendance: this.form.lessonAttendance,
          title: String(this.form.title).trim(),
          fileIds
        }
        if (this.form.description && this.form.description.trim()) payload.description = this.form.description.trim()
        if (this.form.level) payload.level = String(this.form.level)
        await studentWorkApi.create(payload)
        uni.showToast({ title: '已上传', icon: 'success' })
        setTimeout(() => uni.navigateBack(), 600)
      } catch (e) {
        uni.showToast({ title: e.message || e.errMsg || '上传失败', icon: 'none' })
      } finally {
        this.submitting = false
        this.uploadingIdx = -1
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.upload {
  min-height: 100vh;
  background: $bg-page;
  padding-bottom: 160rpx;

  &__loading {
    @include flex-center;
    padding: $spacing-2xl;
    color: $text-secondary;
    min-height: 60vh;
  }

  &__body {
    padding: $spacing-md;
  }

  &__section {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    margin-bottom: $spacing-sm;
  }

  &__label {
    display: flex;
    align-items: center;
    margin-bottom: $spacing-sm;
  }
  &__label-text {
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
  &__label-required {
    color: $danger;
    margin-left: 6rpx;
  }

  &__empty {
    text-align: center;
    padding: $spacing-lg 0;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__empty-tip {
    display: block;
    margin-top: 4rpx;
    color: $text-tertiary;
    font-size: $font-xs;
  }

  &__attendance-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }
  &__attendance {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    border-radius: $radius-md;
    background: $bg-page;
    gap: $spacing-sm;
    transition: background 0.12s ease;

    &--active {
      background: $primary-lighter;
      border-left: 4rpx solid $primary;
    }
  }
  &__attendance-icon {
    width: 80rpx;
    height: 80rpx;
    border-radius: 50%;
    background: $bg-card;
    @include flex-center;
    font-size: 40rpx;
  }
  &__attendance-info {
    flex: 1;
    min-width: 0;
  }
  &__attendance-title {
    font-size: $font-sm;
    font-weight: $font-weight-medium;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  &__attendance-meta {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    font-size: $font-xs;
    color: $text-secondary;
    margin-top: 4rpx;
  }
  &__attendance-status {
    background: $primary-lighter;
    padding: 2rpx 12rpx;
    border-radius: $radius-pill;
    color: $primary-dark;
    font-size: $font-xs;
  }
  &__attendance-check {
    @include flex-center;
    width: 60rpx;
    height: 60rpx;
    border-radius: 50%;
    background: $primary;
    color: #fff;
    font-size: 36rpx;
    font-weight: bold;
  }
  &__attendance-check > text { color: inherit; }

  &__file-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-sm;
    margin-top: $spacing-xs;
  }
  &__file {
    position: relative;
    aspect-ratio: 1 / 1;
    background: $bg-page;
    border-radius: $radius-sm;
    overflow: hidden;
  }
  &__file-img {
    width: 100%;
    height: 100%;
  }
  &__file-video {
    @include flex-center;
    width: 100%;
    height: 100%;
    flex-direction: column;
    background: #1f2937;
    color: #fff;
    font-size: 48rpx;
  }
  &__file-video > text { color: inherit; }
  &__file-videotip {
    font-size: $font-xs;
    color: rgba(255, 255, 255, 0.7);
    margin-top: 4rpx;
  }

  &__file-remove {
    position: absolute;
    top: 0;
    right: 0;
    width: 40rpx;
    height: 40rpx;
    @include flex-center;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 32rpx;
    border-radius: 0 0 0 $radius-sm;
  }
  &__file-remove > text { color: inherit; }

  &__file-uploading {
    position: absolute;
    inset: 0;
    @include flex-center;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: $font-xs;
  }
  &__file-uploading > text { color: inherit; }

  &__file-add {
    @include flex-center;
    flex-direction: column;
    aspect-ratio: 1 / 1;
    background: $bg-page;
    border: 2rpx dashed $divider;
    border-radius: $radius-sm;
    gap: 4rpx;
    color: $text-secondary;
  }
  &__file-add-plus {
    font-size: 56rpx;
    color: $text-tertiary;
    line-height: 1;
  }
  &__file-add-tip {
    font-size: $font-xs;
  }

  &__form-tip {
    margin-top: 12rpx;
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__input {
    width: 100%;
    padding: 16rpx 20rpx;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: $font-sm;
    color: $text-primary;
    box-sizing: border-box;
  }

  &__textarea {
    width: 100%;
    padding: 16rpx 20rpx;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: $font-sm;
    color: $text-primary;
    box-sizing: border-box;
    min-height: 120rpx;
  }

  &__level {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }
  &__level-star {
    font-size: 60rpx;
    color: $text-tertiary;
    line-height: 1;

    &--active {
      color: #f59e0b;
    }
  }
  &__level-star > text { color: inherit; }
  &__level-star--active > text { color: inherit; }

  &__level-clear {
    margin-left: auto;
    padding: 8rpx 20rpx;
    border-radius: $radius-pill;
    font-size: $font-xs;
    background: $bg-page;
    color: $text-secondary;
  }
  &__level-clear > text { color: inherit; }

  &__footer {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    padding: $spacing-sm $spacing-md;
    background: $bg-card;
    box-shadow: 0 -4rpx 12rpx rgba(0, 0, 0, 0.06);
  }
  &__submit {
    @include flex-center;
    height: 88rpx;
    background: linear-gradient(135deg, $primary, $primary-dark);
    color: #fff;
    font-size: $font-base;
    border-radius: $radius-pill;
    box-shadow: 0 8rpx 16rpx rgba(255, 138, 101, 0.32);

    &--disabled {
      opacity: 0.6;
    }
  }
  &__submit > text { color: inherit; }
}
</style>
