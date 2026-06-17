<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!hasInfo" class="empty-state">
      <text>机构暂未填写主页信息</text>
      <text class="text-12 text-muted">请联系机构管理员完善"机构推广信息"</text>
    </view>
    <view v-else>
      <!-- Hero: 机构名 + 简介 -->
      <view class="hero card">
        <text class="title">{{ orgName }}</text>
        <text v-if="promotion.description" class="desc">{{ promotion.description }}</text>
      </view>

      <!-- 品牌故事 -->
      <view v-if="promotion.brandStory" class="card">
        <text class="text-16 text-strong">品牌故事</text>
        <view class="divider" />
        <text class="text-14 paragraph">{{ promotion.brandStory }}</text>
      </view>

      <!-- 教学特色 -->
      <view v-if="(promotion.teachingFeatures || []).length" class="card">
        <text class="text-16 text-strong">教学特色</text>
        <view class="divider" />
        <view class="tag-row">
          <text v-for="f in promotion.teachingFeatures" :key="f" class="tag">{{ f }}</text>
        </view>
      </view>

      <!-- 师资介绍 -->
      <view v-if="promotion.facultyIntro" class="card">
        <text class="text-16 text-strong">师资介绍</text>
        <view class="divider" />
        <text class="text-14 paragraph">{{ promotion.facultyIntro }}</text>
      </view>

      <!-- 经营范围 -->
      <view v-if="(promotion.businessScope || []).length" class="card">
        <text class="text-16 text-strong">经营范围</text>
        <view class="divider" />
        <view class="tag-row">
          <text v-for="s in promotion.businessScope" :key="s" class="tag">{{ s }}</text>
        </view>
      </view>

      <!-- 营业时间 / 地址 / 联系 -->
      <view class="card">
        <text class="text-16 text-strong">联系方式</text>
        <view class="divider" />
        <view v-if="promotion.businessHours" class="row">
          <text class="text-12 text-muted">营业时间</text>
          <text class="text-14">{{ promotion.businessHours }}</text>
        </view>
        <view v-if="promotion.hotline" class="row" @tap="callPhone(promotion.hotline)">
          <text class="text-12 text-muted">招生热线</text>
          <text class="text-14 link">{{ promotion.hotline }} 📞</text>
        </view>
        <view v-if="promotion.email" class="row">
          <text class="text-12 text-muted">邮箱</text>
          <text class="text-14">{{ promotion.email }}</text>
        </view>
        <view v-if="promotion.website" class="row">
          <text class="text-12 text-muted">官方网站</text>
          <text class="text-14">{{ promotion.website }}</text>
        </view>
        <view v-if="promotion.wechatPublic" class="row">
          <text class="text-12 text-muted">公众号</text>
          <text class="text-14">{{ promotion.wechatPublic }}</text>
        </view>
        <view v-if="promotion.nearbyLandmark" class="row">
          <text class="text-12 text-muted">附近地标</text>
          <text class="text-14">{{ promotion.nearbyLandmark }}</text>
        </view>
      </view>

      <!-- 自媒体 -->
      <view v-if="hasSocial" class="card">
        <text class="text-16 text-strong">关注我们</text>
        <view class="divider" />
        <view v-if="promotion.douyin" class="row">
          <text class="text-12 text-muted">抖音号</text>
          <text class="text-14">{{ promotion.douyin }}</text>
        </view>
        <view v-if="promotion.xiaohongshu" class="row">
          <text class="text-12 text-muted">小红书</text>
          <text class="text-14">{{ promotion.xiaohongshu }}</text>
        </view>
        <view v-if="promotion.videoAccount" class="row">
          <text class="text-12 text-muted">视频号</text>
          <text class="text-14">{{ promotion.videoAccount }}</text>
        </view>
      </view>

      <!-- 荣誉 -->
      <view v-if="(promotion.honors || []).length" class="card">
        <text class="text-16 text-strong">机构荣誉</text>
        <view class="divider" />
        <view v-for="h in promotion.honors" :key="h" class="honor-item">
          <text class="text-14">🏆 {{ h }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { orgApi } from '@/api/org'
import { useAuthStore } from '@/stores/auth'
import { mapState } from 'pinia'

export default {
  data() {
    return {
      loading: true,
      promotion: {}
    }
  },
  computed: {
    ...mapState(useAuthStore, ['orgs', 'currentOrgId']),
    orgName() {
      const o = (this.orgs || []).find((x) => x.id === this.currentOrgId)
      return o ? o.name : '本机构'
    },
    hasInfo() {
      const p = this.promotion || {}
      return !!(p.description || p.brandStory || p.facultyIntro
        || (p.teachingFeatures || []).length || (p.businessScope || []).length
        || p.hotline || p.email || p.businessHours)
    },
    hasSocial() {
      const p = this.promotion || {}
      return !!(p.douyin || p.xiaohongshu || p.videoAccount)
    }
  },
  onShow() {
    this.load()
  },
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
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.hero {
  background: linear-gradient(135deg, #5B8FF9 0%, #7AA9FF 100%);
  color: #fff;
  .title { font-size: 40rpx; font-weight: 700; display: block; margin-bottom: 12rpx; }
  .desc { font-size: 26rpx; line-height: 1.6; opacity: 0.95; }
}
.paragraph { line-height: 1.7; white-space: pre-wrap; }
.tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  padding: 8rpx 0;
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-child { border-bottom: none; }
  .link { color: #5B8FF9; }
}
.honor-item {
  padding: 8rpx 0;
}
</style>
