<template>
  <view class="page">
    <view class="card" v-if="platformItems.length">
      <view class="section-title">平台协议</view>
      <view
        v-for="doc in platformItems"
        :key="doc.key"
        class="row"
        @tap="goDetail(doc.key, 'platform')"
      >
        <view class="flex-1">
          <text class="text-14 text-strong">{{ doc.title }}</text>
          <text class="text-12 text-muted">v{{ doc.version }} · {{ doc.effectiveAt }} 起生效</text>
        </view>
        <text class="text-12 text-muted">›</text>
      </view>
    </view>

    <view class="card" v-if="orgItems.length">
      <view class="section-title">本机构协议</view>
      <view
        v-for="doc in orgItems"
        :key="doc.key"
        class="row"
        @tap="goDetail(doc.key, 'org')"
      >
        <view class="flex-1">
          <text class="text-14 text-strong">{{ doc.title }}</text>
          <text class="text-12 text-muted">v{{ doc.version }}</text>
        </view>
        <text class="text-12 text-muted">›</text>
      </view>
    </view>

    <view v-if="!loading && !platformItems.length && !orgItems.length" class="empty-state">
      暂无协议
    </view>
  </view>
</template>

<script>
import { legalApi } from '@/api/legal'
import { useAuthStore } from '@/stores/auth'
import { mapState } from 'pinia'

// 机构级协议 key 清单 (与后端 LegalDoc enum 一致)
const ORG_KEYS = [
  { key: 'purchase-agreement', title: '课程购买协议' },
  { key: 'refund-policy', title: '退费规则' },
  { key: 'org-about', title: '关于本机构' },
  { key: 'org-faq', title: '常见问题 FAQ' },
  { key: 'points-rule', title: '积分规则' },
  { key: 'share-rule', title: '分享行为规范' },
  { key: 'org-contact', title: '联系方式' }
]

export default {
  data() {
    return {
      platformItems: [],
      orgItems: [],
      loading: false
    }
  },
  computed: {
    ...mapState(useAuthStore, ['currentOrgId'])
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      // 拉平台协议清单
      try {
        const res = await legalApi.listPlatform()
        this.platformItems = res.data?.items || []
      } catch (_) {
        this.platformItems = []
      }
      // 机构级: 按预设 key 逐个尝试拉; 不存在的静默跳过
      const orgId = this.currentOrgId
      if (orgId) {
        const got = []
        await Promise.all(ORG_KEYS.map(async (k) => {
          try {
            const r = await legalApi.getOrgDoc(orgId, k.key)
            if (r && r.data && r.data._id) {
              got.push({ key: k.key, title: r.data.title || k.title, version: r.data.version })
            }
          } catch (_) {
            // 404 表示该机构没填这份协议, 静默跳过
          }
        }))
        this.orgItems = got
      } else {
        this.orgItems = []
      }
      this.loading = false
    },
    goDetail(key, scope) {
      uni.navigateTo({ url: `/pages/legal/detail?key=${encodeURIComponent(key)}&scope=${scope}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: #1f2937;
  padding: 8rpx 0 16rpx;
}
.row {
  display: flex;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-child { border-bottom: none; }
  .flex-1 { display: flex; flex-direction: column; gap: 4rpx; }
}
</style>
