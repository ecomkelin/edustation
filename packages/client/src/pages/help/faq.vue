<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!data.contentHtml" class="empty-state">
      <text>机构暂未填写 FAQ</text>
      <text class="text-12 text-muted">请联系机构教务完善"常见问题"协议</text>
    </view>
    <view v-else>
      <view class="header card">
        <text class="title">{{ data.title }}</text>
        <text class="text-12 text-muted">v{{ data.version }}</text>
      </view>
      <view class="content card">
        <rich-text :nodes="data.contentHtml" />
      </view>
    </view>
  </view>
</template>

<script>
import { legalApi } from '@/api/legal'
import { useAuthStore } from '@/stores/auth'
import { mapState } from 'pinia'

export default {
  data() {
    return { loading: true, data: { title: '常见问题 FAQ', version: '', contentHtml: '' } }
  },
  computed: { ...mapState(useAuthStore, ['currentOrgId']) },
  onShow() { this.load() },
  methods: {
    async load() {
      if (!this.currentOrgId) {
        this.loading = false
        return
      }
      this.loading = true
      try {
        const res = await legalApi.getOrgDoc(this.currentOrgId, 'org-faq')
        this.data = {
          title: res.data?.title || '常见问题 FAQ',
          version: res.data?.version || '',
          contentHtml: res.data?.contentHtml || ''
        }
      } catch (_) {
        this.data = { title: '常见问题 FAQ', version: '', contentHtml: '' }
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.header {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
  .title { font-size: 36rpx; font-weight: 600; color: #1f2937; }
}
.content { font-size: 28rpx; line-height: 1.8; color: #1f2937; }
</style>
