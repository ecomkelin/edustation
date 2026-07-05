<!--
  作品详情 - 2026-07-01 实装
  - 图片: 顶部 swiper 轮播, tap 全屏 previewImage
  - 视频: <video> 标签播放
  - PDF/音频: 文件名 + 下载按钮
-->
<template>
  <view class="detail">
    <view v-if="loading" class="detail__loading">
      <text>加载中…</text>
    </view>

    <view v-else-if="!work" class="detail__empty">
      <text>作品不存在或已删除</text>
      <view class="detail__back press" @tap="goBack">
        <text>返回作品墙</text>
      </view>
    </view>

    <scroll-view v-else scroll-y class="detail__body">
      <!-- 媒体：图片走 swiper 轮播,视频 / PDF / 音频 渲染 -->
      <view v-if="imageUrls.length || videoUrls.length || otherUrls.length" class="detail__media">
        <swiper
          v-if="(imageUrls.length + videoUrls.length) > 0"
          class="detail__swiper"
          :indicator-dots="true"
          :circular="true"
          :autoplay="false"
          indicator-color="rgba(255, 255, 255, 0.5)"
          indicator-active-color="#fff"
          :interval="5000"
          :duration="300"
        >
          <swiper-item v-for="u in videoUrls" :key="'v-' + u">
            <video
              :src="u"
              controls
              object-fit="contain"
              :show-fullscreen-btn="true"
              :vslide-gesture="true"
              :enable-progress-gesture="true"
              class="detail__video"
              @play="onVideoPlay"
              @pause="onVideoPause"
            />
          </swiper-item>
          <swiper-item v-for="u in imageUrls" :key="'i-' + u">
            <image
              class="detail__image"
              :src="u"
              mode="aspectFit"
              @tap="previewImage(u)"
            />
          </swiper-item>
        </swiper>

        <view v-if="otherUrls.length" class="detail__files">
          <view v-for="u in otherUrls" :key="'o-' + u" class="detail__file press" @tap="downloadFile(u)">
            <text class="detail__file-name">{{ fileName(u) }}</text>
            <text class="detail__file-type">{{ fileTypeLabel(u) }}</text>
            <text class="detail__file-cta">下载</text>
          </view>
        </view>
      </view>

      <view v-else class="detail__no-media">
        <text>本作品未含文件</text>
      </view>

      <!-- 标题 / 描述 / 等级 -->
      <view class="detail__section">
        <view class="detail__title">
          <text>{{ work.title }}</text>
        </view>

        <view v-if="work.level" class="detail__level">
          <text class="detail__level-stars">{{ '★'.repeat(work.level) }}{{ '☆'.repeat(5 - work.level) }}</text>
          <text class="detail__level-label">{{ work.level }} / 5</text>
        </view>

        <view v-if="work.description" class="detail__desc">
          <text>{{ work.description }}</text>
        </view>
      </view>

      <!-- 元数据 -->
      <view class="detail__meta">
        <view v-if="work.student && work.student.name" class="detail__meta-row">
          <text class="detail__meta-lbl">学生</text>
          <text class="detail__meta-val">{{ work.student.name }}</text>
        </view>
        <view v-if="work.subject && work.subject.name" class="detail__meta-row">
          <text class="detail__meta-lbl">学科</text>
          <text class="detail__meta-val">{{ work.subject.name }}</text>
        </view>
        <view v-if="work.courseInstance && work.courseInstance.name" class="detail__meta-row">
          <text class="detail__meta-lbl">开班</text>
          <text class="detail__meta-val">{{ work.courseInstance.name }}</text>
        </view>
        <view v-if="work.lessonSchedule && work.lessonSchedule.plannedStartTime" class="detail__meta-row">
          <text class="detail__meta-lbl">排课</text>
          <text class="detail__meta-val">{{ scheduleTimeLabel() }}</text>
        </view>
        <view v-if="work.uploadedBy" class="detail__meta-row">
          <text class="detail__meta-lbl">上传者</text>
          <text class="detail__meta-val">{{ work.uploadedBy.realName || work.uploadedBy.mobile || '—' }}</text>
        </view>
        <view class="detail__meta-row">
          <text class="detail__meta-lbl">上传时间</text>
          <text class="detail__meta-val">{{ createdAtLabel() }}</text>
        </view>
      </view>

      <view class="detail__bottom" />
    </scroll-view>
  </view>
</template>

<script>
import { studentWorkApi } from '@/api/studentWork'
import { download } from '@/api/request'
import { date } from '@/utils/date'

export default {
  data() {
    return {
      loading: true,
      work: null,
      videoUrls: [],
      imageUrls: [],
      otherUrls: []
    }
  },
  onLoad(opts) {
    this.workId = (opts && opts.id) || ''
    this.load()
  },
  methods: {
    // 模板方法包装 — options API 不认 module-scope 的 date util
    scheduleTimeLabel() {
      const t = this.work && this.work.lessonSchedule && this.work.lessonSchedule.plannedStartTime
      return t ? date.fmt(t) : ''
    },
    createdAtLabel() {
      const t = this.work && this.work.createdAt
      return t ? date.fmt(t) : ''
    },

    isVideoUrl(url) {
      return /\.(mp4|mov|m4v|webm|avi|mkv)(\?|$)/i.test(url)
    },
    isImageUrl(url) {
      return /\.(jpe?g|png|gif|webp|bmp|heic|avif)(\?|$)/i.test(url)
    },
    isPdfUrl(url) {
      return /\.pdf(\?|$)/i.test(url)
    },
    isAudioUrl(url) {
      return /\.(mp3|wav|m4a|aac|ogg|flac)(\?|$)/i.test(url)
    },
    classify(urls) {
      const videos = []
      const images = []
      const others = []
      for (const u of urls || []) {
        if (this.isVideoUrl(u)) videos.push(u)
        else if (this.isImageUrl(u)) images.push(u)
        else others.push(u)
      }
      this.videoUrls = videos
      this.imageUrls = images
      this.otherUrls = others
    },
    async load() {
      if (!this.workId) {
        uni.showToast({ title: '缺少作品 id', icon: 'none' })
        uni.navigateBack()
        return
      }
      this.loading = true
      try {
        const res = await studentWorkApi.detail(this.workId)
        const data = res && res.data ? res.data : res
        this.work = data || null
        if (this.work) this.classify(this.work.fileUrls || [])
      } catch (e) {
        this.work = null
      } finally {
        this.loading = false
      }
    },
    previewImage(current) {
      if (!this.imageUrls.length) return
      uni.previewImage({ urls: this.imageUrls, current, indicator: 'number', loop: true })
    },
    async downloadFile(url) {
      uni.showLoading({ title: '下载中…' })
      try {
        const tempPath = await download(url)
        uni.hideLoading()
        if (this.isPdfUrl(url)) {
          uni.openDocument({ filePath: tempPath, success: () => {}, fail: () => {
            uni.showToast({ title: '打开失败', icon: 'none' })
          } })
        } else if (this.isImageUrl(url)) {
          uni.saveImageToPhotosAlbum({ filePath: tempPath, success: () => {
            uni.showToast({ title: '已保存到相册', icon: 'success' })
          } })
        } else {
          uni.showToast({ title: '已下载到临时目录', icon: 'none' })
        }
      } catch (e) {
        uni.hideLoading()
        uni.showToast({ title: '下载失败', icon: 'none' })
      }
    },
    fileName(url) {
      if (!url) return '文件'
      const s = String(url).split('?')[0]
      const parts = s.split('/')
      return parts[parts.length - 1] || '文件'
    },
    fileTypeLabel(url) {
      if (this.isPdfUrl(url)) return 'PDF'
      if (this.isAudioUrl(url)) return '音频'
      return '文件'
    },
    onVideoPlay() {
      // 单 swiper 内嵌 video，不需处理 (扩展位)
    },
    onVideoPause() {
      // 占位
    },
    goBack() {
      uni.navigateBack()
    }
  }
}
</script>

<style lang="scss" scoped>
.detail {
  min-height: 100vh;
  background: $bg-page;

  &__loading,
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    color: $text-secondary;
    min-height: 60vh;
  }
  &__back {
    margin-top: $spacing-md;
    padding: 12rpx 32rpx;
    background: $primary;
    color: #fff;
    border-radius: $radius-pill;
    font-size: $font-sm;
  }
  &__back > text { color: inherit; }

  &__body {
    height: 100vh;
  }

  &__media {
    background: #000;
    width: 100%;
  }
  &__swiper {
    width: 100%;
    height: 750rpx;
  }
  &__image {
    width: 100%;
    height: 100%;
  }
  &__video {
    width: 100%;
    height: 100%;
    background: #000;
  }
  &__files {
    background: $bg-card;
    padding: $spacing-md;
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }
  &__file {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    background: $bg-page;
    border-radius: $radius-md;
    gap: $spacing-sm;
  }
  &__file-name {
    flex: 1;
    font-size: $font-sm;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__file-type {
    font-size: $font-xs;
    color: $text-secondary;
    background: $primary-lighter;
    padding: 4rpx 10rpx;
    border-radius: $radius-pill;
  }
  &__file-cta {
    font-size: $font-sm;
    color: $primary;
    font-weight: $font-weight-medium;
  }
  &__file-cta > text { color: inherit; }

  &__no-media {
    @include flex-center;
    padding: 100rpx 0;
    color: $text-tertiary;
    background: $bg-card;
  }

  &__section {
    background: $bg-card;
    padding: $spacing-md;
    margin-top: $spacing-sm;
  }

  &__title {
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.4;
  }

  &__level {
    margin-top: $spacing-sm;
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }
  &__level-stars {
    font-size: $font-lg;
    color: #f59e0b;
    letter-spacing: 4rpx;
  }
  &__level-label {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__desc {
    margin-top: $spacing-sm;
    font-size: $font-base;
    color: $text-primary;
    line-height: 1.6;
    white-space: pre-wrap;
  }

  &__meta {
    background: $bg-card;
    padding: $spacing-md;
    margin-top: $spacing-sm;
    display: flex;
    flex-direction: column;
    gap: $spacing-xs;
  }
  &__meta-row {
    display: flex;
    align-items: center;
    font-size: $font-sm;
  }
  &__meta-lbl {
    width: 120rpx;
    color: $text-secondary;
  }
  &__meta-val {
    flex: 1;
    color: $text-primary;
  }

  &__bottom {
    height: 80rpx;
  }
}
</style>
