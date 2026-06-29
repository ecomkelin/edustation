<!--
  机构主页 - 推广信息展示
-->
<template>
  <view class="org-home">
    <view class="org-home__cover">
      <view class="org-home__cover-bg" />
      <view class="org-home__logo">
        <text class="org-home__logo-emoji">🏫</text>
      </view>
    </view>

    <view class="org-home__main">
      <view class="org-home__name">
        <text class="org-home__name-text">{{ org?.name || '机构名称' }}</text>
        <text v-if="org?.nameAbbreviation" class="org-home__name-sub">{{ org.nameAbbreviation }}</text>
      </view>

      <view v-if="org?.slogan" class="org-home__slogan">
        <text>{{ org.slogan }}</text>
      </view>

      <view class="org-home__quick">
        <view class="org-home__quick-item press" @tap="onCall">
          <view class="org-home__quick-icon org-home__quick-icon--phone">📞</view>
          <text class="org-home__quick-label">电话</text>
        </view>
        <view class="org-home__quick-item press" @tap="onLocation">
          <view class="org-home__quick-icon org-home__quick-icon--location">📍</view>
          <text class="org-home__quick-label">地址</text>
        </view>
        <view class="org-home__quick-item press" @tap="onWx">
          <view class="org-home__quick-icon org-home__quick-icon--wx">💬</view>
          <text class="org-home__quick-label">微信</text>
        </view>
        <view class="org-home__quick-item press" @tap="onShare">
          <view class="org-home__quick-icon org-home__quick-icon--share">🚀</view>
          <text class="org-home__quick-label">分享</text>
        </view>
      </view>

      <view v-if="org?.introduction" class="org-home__section">
        <text class="org-home__section-title">🏛 关于我们</text>
        <view class="org-home__section-content">
          <text>{{ org.introduction }}</text>
        </view>
      </view>

      <view v-if="org?.address" class="org-home__section">
        <text class="org-home__section-title">📍 地址信息</text>
        <view class="org-home__address" @tap="onLocation">
          <text>{{ org.address }}</text>
          <text class="org-home__address-arrow">›</text>
        </view>
      </view>

      <view v-if="org?.features && org.features.length" class="org-home__section">
        <text class="org-home__section-title">⭐ 特色服务</text>
        <view class="org-home__features">
          <view v-for="(f, i) in org.features" :key="i" class="org-home__feature">
            <text>{{ f }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { orgApi } from '@/api/org'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/components/common/Toast'
import { copyText } from '@/utils/share'

export default {
  data() {
    return {
      org: null
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      const orgId = useAuthStore().currentOrgId
      if (!orgId) return
      try {
        this.org = await orgApi.promotion(orgId)
      } catch (e) {
        this.org = null
      }
    },
    onCall() {
      const phone = this.org?.hotline || this.org?.contactPhone
      if (!phone) return toast.text('暂无电话')
      uni.makePhoneCall({ phoneNumber: phone, fail: () => {} })
    },
    onLocation() {
      if (!this.org?.address) return toast.text('暂无地址')
      uni.openLocation({
        latitude: 30.0,
        longitude: 105.0,
        name: this.org.name,
        address: this.org.address,
        scale: 16
      })
    },
    async onWx() {
      const wx = this.org?.wechat
      if (!wx) return toast.text('暂无微信号')
      const ok = await copyText(wx)
      toast[ok ? 'success' : 'error'](ok ? '已复制微信号' : '复制失败')
    },
    onShare() {
      toast.text('长按右上角分享给朋友')
    }
  }
}
</script>

<style lang="scss" scoped>
.org-home {
  min-height: 100vh;
  background: $bg-page;

  &__cover {
    height: 360rpx;
    background: linear-gradient(135deg, $primary 0%, $primary-light 50%, $accent-light 100%);
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 0;
  }

  &__cover-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4), transparent 50%);
  }

  &__logo {
    width: 160rpx;
    height: 160rpx;
    background: $bg-card;
    border-radius: 36rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16rpx 32rpx rgba(0, 0, 0, 0.18);
    margin-bottom: -80rpx;
    position: relative;
    z-index: 1;
  }

  &__logo-emoji {
    font-size: 80rpx;
  }

  &__main {
    padding: $spacing-2xl $spacing-md $spacing-md;
  }

  &__name {
    text-align: center;
    margin-bottom: $spacing-md;
  }

  &__name-text {
    display: block;
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__name-sub {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__slogan {
    text-align: center;
    padding: $spacing-sm $spacing-md;
    background: $primary-lighter;
    border-radius: $radius-pill;
    color: $primary-dark;
    font-size: $font-sm;
    margin: 0 auto $spacing-md;
    max-width: 80%;
  }

  &__quick {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md $spacing-sm;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }

  &__quick-item {
    @include flex-center;
    flex-direction: column;
  }

  &__quick-icon {
    width: 80rpx;
    height: 80rpx;
    border-radius: 20rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    margin-bottom: $spacing-xs;

    &--phone {
      background: $primary-lighter;
    }
    &--location {
      background: #E5F0FA;
    }
    &--wx {
      background: #C8F0DF;
    }
    &--share {
      background: #EDE3FA;
    }
  }

  &__quick-label {
    font-size: $font-xs;
    color: $text-primary;
  }

  &__section {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }

  &__section-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  &__section-content {
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.8;
  }

  &__address {
    display: flex;
    align-items: center;
    padding: $spacing-sm;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: $font-sm;
    color: $text-primary;

    & > text:first-child {
      flex: 1;
    }
  }

  &__address-arrow {
    color: $text-tertiary;
    font-size: 32rpx;
  }

  &__features {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__feature {
    padding: 8rpx 20rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-sm;
    border-radius: $radius-pill;

    & > text {
      color: inherit;
    }
  }
}
</style>