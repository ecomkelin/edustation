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
        <text class="text-12 text-muted" @tap="go(`/pages/lessonSchedule/detail?id=${data.lessonSchedule?.id}`)">
          {{ productName }} · {{ formatDateTime(data.lessonSchedule?.plannedStartTime) }} ›
        </text>
      </view>
    </view>
  </view>
</template>

<script>
import { lessonWorkApi } from '@/api/lessonWork'
import { formatDateTime } from '@/utils/format'

export default {
  data() { return { id: '', data: null, loading: true } },
  computed: {
    productName() {
      const ci = this.data?.lessonSchedule?.courseInstance
      return ci?.courseProduct?.name || '课程'
    }
  },
  onLoad(query) {
    this.id = query.id
    // 后端没有单作品 GET /lesson-works/:id（仅 list）；从 list 过滤
    this.loadFromList()
  },
  methods: {
    formatDateTime,
    go(url) { uni.navigateTo({ url }) },
    async loadFromList() {
      this.loading = true
      try {
        const res = await lessonWorkApi.list({ pageSize: 200 })
        const items = res.data?.items || []
        this.data = items.find((x) => String(x.id) === String(this.id)) || null
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
</style>
