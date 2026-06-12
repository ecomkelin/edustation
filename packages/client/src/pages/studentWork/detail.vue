<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!data" class="empty-state">作品不存在</view>
    <view v-else>
      <view class="card">
        <text class="text-18 text-strong">{{ data.title }}</text>
        <text class="text-12 text-muted">{{ formatDateTime(data.createdAt) }}</text>
      </view>

      <view class="card">
        <text class="text-16 text-strong">作品</text>
        <view class="divider" />
        <view v-if="(data.fileUrls || []).length" class="files">
          <image
            v-for="(u, i) in data.fileUrls"
            :key="i"
            :src="u"
            mode="widthFix"
            class="file"
            @tap="preview(i)"
          />
        </view>
        <view v-else class="text-12 text-muted">无文件</view>
      </view>

      <view v-if="data.description" class="card">
        <text class="text-16 text-strong">描述</text>
        <view class="divider" />
        <text class="text-14">{{ data.description }}</text>
      </view>

      <view class="card">
        <text class="text-16 text-strong">关联课程</text>
        <view class="divider" />
        <view v-if="data.lessonSchedule" class="lesson-line" @tap="goSchedule">
          <text class="text-14">{{ productName }}</text>
          <text v-if="subjectName" class="text-12 text-muted">· {{ subjectName }}</text>
          <text class="text-12 text-muted">· {{ formatDateTime(data.lessonSchedule.plannedStartTime) }} ›</text>
        </view>
        <view v-else class="text-12 text-muted">无关联排课</view>
      </view>
    </view>
  </view>
</template>

<script>
import { studentWorkApi } from '@/api/studentWork'
import { formatDateTime } from '@/utils/format'

export default {
  data() { return { id: '', data: null, loading: true } },
  computed: {
    productName() {
      const ci = this.data?.lessonSchedule?.courseInstance
      return ci?.courseProduct?.name || ci?.name || '课程'
    },
    subjectName() {
      return this.data?.subject?.name || ''
    }
  },
  onLoad(query) {
    this.id = query.id
    this.load()
  },
  methods: {
    formatDateTime,
    go(url) { uni.navigateTo({ url }) },
    goSchedule() {
      const sid = this.data?.lessonSchedule?._id || this.data?.lessonSchedule?.id
      if (sid) this.go(`/pages/lessonSchedule/detail?id=${sid}`)
    },
    async load() {
      this.loading = true
      try {
        const res = await studentWorkApi.detail(this.id)
        this.data = res.data || null
      } catch (_) {
        this.data = null
      } finally {
        this.loading = false
      }
    },
    preview(index) {
      uni.previewImage({
        urls: this.data.fileUrls,
        current: this.data.fileUrls[index]
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.files {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
  .file { width: 100%; border-radius: 12rpx; }
}
.lesson-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8rpx;
  align-items: baseline;
}
</style>
