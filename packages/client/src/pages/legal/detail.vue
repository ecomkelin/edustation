<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!data.title" class="empty-state">协议不存在</view>
    <view v-else>
      <view class="header card">
        <text class="title">{{ data.title }}</text>
        <view class="meta">
          <text class="tag">v{{ data.version }}</text>
          <text v-if="data.effectiveAt" class="text-12 text-muted">{{ data.effectiveAt }} 起生效</text>
        </view>
        <text v-if="data.summary" class="summary">{{ data.summary }}</text>
      </view>

      <view class="content card">
        <!-- 后端预编译的 HTML, rich-text 跨端 (mp-weixin / h5 / app-plus) 一致渲染 -->
        <rich-text :nodes="data.contentHtml" />
      </view>

      <view class="text-center text-12 text-muted footer-tip">
        本协议解释权归 EduStation 平台运营方所有
      </view>
    </view>
  </view>
</template>

<script>
import { legalApi } from '@/api/legal'
import { useAuthStore } from '@/stores/auth'

export default {
  data() {
    return {
      data: {
        title: '',
        version: '',
        effectiveAt: '',
        summary: '',
        contentHtml: ''
      },
      loading: true
    }
  },
  onLoad(query) {
    const key = query.key
    const scope = query.scope || 'platform'
    this.load(key, scope)
  },
  methods: {
    async load(key, scope) {
      this.loading = true
      try {
        let res
        if (scope === 'platform') {
          res = await legalApi.getPlatform(key)
          this.data = {
            title: res.data?.title || '',
            version: res.data?.version || '',
            effectiveAt: res.data?.effectiveAt || '',
            summary: res.data?.summary || '',
            contentHtml: res.data?.html || ''
          }
        } else {
          const auth = useAuthStore()
          res = await legalApi.getOrgDoc(auth.currentOrgId, key)
          this.data = {
            title: res.data?.title || '',
            version: res.data?.version || '',
            effectiveAt: res.data?.updatedAt
              ? new Date(res.data.updatedAt).toISOString().slice(0, 10)
              : '',
            summary: '',
            contentHtml: res.data?.contentHtml || ''
          }
        }
        // 同步 navigationBarTitle
        if (this.data.title) {
          uni.setNavigationBarTitle({ title: this.data.title })
        }
      } catch (_) {
        this.data = { title: '', version: '', effectiveAt: '', summary: '', contentHtml: '' }
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 48rpx; }
.header {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  .title { font-size: 36rpx; font-weight: 600; color: #1f2937; }
  .meta {
    display: flex;
    align-items: center;
    gap: 12rpx;
    margin-top: 4rpx;
  }
  .tag {
    background: #eef2ff;
    color: #5B8FF9;
    font-size: 22rpx;
    padding: 2rpx 12rpx;
    border-radius: 8rpx;
  }
  .summary {
    margin-top: 12rpx;
    padding: 12rpx 16rpx;
    background: #fafafa;
    border-left: 4rpx solid #5B8FF9;
    color: #4b5563;
    font-size: 26rpx;
    line-height: 1.6;
  }
}
.content {
  font-size: 28rpx;
  line-height: 1.8;
  color: #1f2937;
}
.text-center { text-align: center; }
.footer-tip { margin-top: 24rpx; }
</style>
