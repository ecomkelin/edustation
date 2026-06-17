<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else>
      <!-- 机构联系方式 -->
      <view class="card">
        <text class="text-16 text-strong">机构联系</text>
        <view class="divider" />
        <view v-if="promotion.hotline" class="row" @tap="callPhone(promotion.hotline)">
          <text class="text-12 text-muted">招生热线</text>
          <text class="text-14 link">{{ promotion.hotline }} 📞</text>
        </view>
        <view v-if="promotion.serviceWechat" class="row" @tap="copyText(promotion.serviceWechat)">
          <text class="text-12 text-muted">客服微信</text>
          <text class="text-14">{{ promotion.serviceWechat }}</text>
        </view>
        <view v-if="promotion.serviceQq" class="row">
          <text class="text-12 text-muted">客服 QQ</text>
          <text class="text-14">{{ promotion.serviceQq }}</text>
        </view>
        <view v-if="promotion.email" class="row" @tap="copyText(promotion.email)">
          <text class="text-12 text-muted">邮箱</text>
          <text class="text-14">{{ promotion.email }}</text>
        </view>
        <view v-if="promotion.businessHours" class="row">
          <text class="text-12 text-muted">营业时间</text>
          <text class="text-14">{{ promotion.businessHours }}</text>
        </view>
        <view v-if="!hasOrgContact" class="empty-state">
          <text class="text-12 text-muted">机构暂未填写联系方式</text>
        </view>
      </view>

      <!-- 平台客服 -->
      <view v-if="siteConfig.config.customerServicePhone" class="card">
        <text class="text-16 text-strong">平台客服 / 投诉</text>
        <view class="divider" />
        <view class="row" @tap="callPhone(siteConfig.config.customerServicePhone)">
          <text class="text-12 text-muted">客服电话</text>
          <text class="text-14 link">{{ siteConfig.config.customerServicePhone }} 📞</text>
        </view>
      </view>

      <!-- 运营主体 -->
      <view v-if="siteConfig.config.operatorName" class="card">
        <text class="text-16 text-strong">运营主体</text>
        <view class="divider" />
        <view class="row">
          <text class="text-12 text-muted">主体名称</text>
          <text class="text-14">{{ siteConfig.config.operatorName }}</text>
        </view>
        <view v-if="siteConfig.config.operatorAddress" class="row">
          <text class="text-12 text-muted">地址</text>
          <text class="text-14">{{ siteConfig.config.operatorAddress }}</text>
        </view>
        <view v-if="siteConfig.config.operatorContact" class="row">
          <text class="text-12 text-muted">联系</text>
          <text class="text-14">{{ siteConfig.config.operatorContact }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { orgApi } from '@/api/org'
import { useAuthStore } from '@/stores/auth'
import { useSiteConfigStore } from '@/stores/siteConfig'
import { mapState } from 'pinia'

export default {
  data() {
    return { loading: true, promotion: {} }
  },
  computed: {
    ...mapState(useAuthStore, ['currentOrgId']),
    siteConfig() { return useSiteConfigStore() },
    hasOrgContact() {
      const p = this.promotion || {}
      return !!(p.hotline || p.serviceWechat || p.serviceQq || p.email || p.businessHours)
    }
  },
  onShow() { this.load() },
  methods: {
    async load() {
      if (!this.currentOrgId) {
        this.loading = false
        return
      }
      this.loading = true
      try {
        const res = await orgApi.getPromotion(this.currentOrgId)
        this.promotion = res.data || {}
      } catch (_) {
        this.promotion = {}
      } finally {
        this.loading = false
      }
    },
    callPhone(phone) {
      if (!phone) return
      uni.makePhoneCall({ phoneNumber: String(phone).replace(/\s+/g, '') })
    },
    copyText(text) {
      if (!text) return
      uni.setClipboardData({
        data: String(text),
        success: () => uni.showToast({ title: '已复制', icon: 'success' })
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-child { border-bottom: none; }
  .link { color: #5B8FF9; }
}
</style>
