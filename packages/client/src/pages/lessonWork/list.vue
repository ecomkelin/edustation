<template>
  <view class="page">
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
        @tap="go(`/pages/lessonWork/detail?id=${w.id}`)"
      >
        <image v-if="w.fileUrls && w.fileUrls[0]" :src="w.fileUrls[0]" mode="aspectFill" class="cover" />
        <view v-else class="cover cover-empty">📷</view>
        <text class="text-14 text-strong text-ellipsis">{{ w.title }}</text>
        <text class="text-12 text-muted">{{ formatDate(w.createdAt) }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { lessonWorkApi } from '@/api/lessonWork'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDate } from '@/utils/format'

export default {
  data() { return { list: [], loading: true, lessonSchedule: '' } },
  computed: { ...mapState(useStudentStore, ['activeStudentId']) },
  onLoad(query) {
    this.lessonSchedule = query.lessonSchedule || ''
  },
  onShow() {
    if (this.activeStudentId || this.lessonSchedule) this.load()
  },
  methods: {
    formatDate,
    go(url) { uni.navigateTo({ url }) },
    async load() {
      this.loading = true
      try {
        const params = { pageSize: 30 }
        if (this.lessonSchedule) params.lessonSchedule = this.lessonSchedule
        if (!this.lessonSchedule && this.activeStudentId) params.student = this.activeStudentId
        const res = await lessonWorkApi.list(params)
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
