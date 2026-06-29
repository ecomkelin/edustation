<!--
  联系我们
-->
<template>
  <view class="contact">
    <view class="contact__hero">
      <view class="contact__hero-art">
        <text>📞</text>
      </view>
      <text class="contact__hero-title">联系机构</text>
      <text class="contact__hero-sub">有任何问题,我们的老师随时为您服务</text>
    </view>

    <view class="contact__list">
      <view class="contact__item press" @tap="onCall">
        <view class="contact__item-icon contact__item-icon--phone">📞</view>
        <view class="contact__item-info">
          <text class="contact__item-title">客服电话</text>
          <text class="contact__item-desc">{{ hotline || '请联系机构获取' }}</text>
        </view>
        <text class="contact__item-arrow">›</text>
      </view>

      <view class="contact__item press" @tap="onCopy">
        <view class="contact__item-icon contact__item-icon--wx">💬</view>
        <view class="contact__item-info">
          <text class="contact__item-title">机构微信号</text>
          <text class="contact__item-desc">点击复制微信号</text>
        </view>
        <text class="contact__item-arrow">›</text>
      </view>

      <view class="contact__item press" @tap="onLocation">
        <view class="contact__item-icon contact__item-icon--location">📍</view>
        <view class="contact__item-info">
          <text class="contact__item-title">校区位置</text>
          <text class="contact__item-desc">{{ address || '请联系机构获取' }}</text>
        </view>
        <text class="contact__item-arrow">›</text>
      </view>

      <view class="contact__item press" @tap="onHours">
        <view class="contact__item-icon contact__item-icon--hours">🕐</view>
        <view class="contact__item-info">
          <text class="contact__item-title">营业时间</text>
          <text class="contact__item-desc">周一至周日 09:00 - 21:00</text>
        </view>
        <text class="contact__item-arrow">›</text>
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
      hotline: '',
      address: '',
      wechat: ''
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
        const res = await orgApi.promotion(orgId)
        this.hotline = res?.hotline || res?.contactPhone || ''
        this.address = res?.address || ''
        this.wechat = res?.wechat || ''
      } catch (_) {}
    },
    onCall() {
      if (!this.hotline) {
        toast.text('暂无电话,请联系机构')
        return
      }
      uni.makePhoneCall({ phoneNumber: this.hotline, fail: () => {} })
    },
    async onCopy() {
      const text = this.wechat || '请向机构老师索取微信号'
      const ok = await copyText(text)
      toast[ok ? 'success' : 'error'](ok ? '已复制' : '复制失败')
    },
    onLocation() {
      if (!this.address) {
        toast.text('暂无地址,请联系机构')
        return
      }
      uni.openLocation({
        latitude: 30.0, // 占位
        longitude: 105.0,
        name: '机构位置',
        address: this.address,
        scale: 16
      })
    },
    onHours() {
      uni.showModal({
        title: '营业时间',
        content: '周一至周日 09:00 - 21:00\n法定节假日另行通知',
        showCancel: false
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.contact {
  min-height: 100vh;
  background: $bg-page;
  padding: $spacing-md;

  &__hero {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl 0;
    background: linear-gradient(180deg, #FFE4D3 0%, $bg-page 100%);
    border-radius: $radius-md;
    margin-bottom: $spacing-md;
  }

  &__hero-art {
    width: 160rpx;
    height: 160rpx;
    background: linear-gradient(135deg, $primary, $primary-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 80rpx;
    margin-bottom: $spacing-md;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.32);
    animation: float 3s ease-in-out infinite;
  }

  &__hero-title {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__hero-sub {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
  }

  &__item-icon {
    width: 88rpx;
    height: 88rpx;
    border-radius: 22rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 44rpx;
    margin-right: $spacing-md;

    &--phone {
      background: $primary-lighter;
    }
    &--wx {
      background: #C8F0DF;
    }
    &--location {
      background: #E5F0FA;
    }
    &--hours {
      background: #FFF1D0;
    }
  }

  &__item-info {
    flex: 1;
  }

  &__item-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }

  &__item-desc {
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__item-arrow {
    font-size: 40rpx;
    color: $text-tertiary;
  }
}
</style>