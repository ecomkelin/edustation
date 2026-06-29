<!--
  分享得积分 - 后端 trigger=stub, 暂做占位
-->
<template>
  <view class="share">
    <view class="share__hero">
      <view class="share__hero-art">
        <text>💌</text>
      </view>
      <text class="share__hero-title">邀请好友</text>
      <text class="share__hero-sub">分享得积分 (即将上线)</text>
    </view>

    <view class="share__card">
      <view class="share__row">
        <text class="share__label">🎁 邀请奖励</text>
        <text class="share__value">+50 积分 / 人</text>
      </view>
      <view class="share__row">
        <text class="share__label">👥 累计邀请</text>
        <text class="share__value">{{ stats.invited }} 人</text>
      </view>
      <view class="share__row">
        <text class="share__label">💰 累计奖励</text>
        <text class="share__value">{{ stats.earned }} 积分</text>
      </view>
    </view>

    <view class="share__invite">
      <text class="share__invite-title">我的邀请链接</text>
      <view class="share__invite-link">
        <text>{{ inviteLink }}</text>
      </view>
      <view class="share__invite-actions">
        <view class="share__invite-btn press" @tap="onCopy">
          <text>📋 复制链接</text>
        </view>
        <view class="share__invite-btn press" @tap="onShare">
          <text>🚀 立即分享</text>
        </view>
      </view>
    </view>

    <view class="share__rules">
      <text class="share__rules-title">📜 规则说明</text>
      <text class="share__rules-item">1. 邀请新家长注册,您和好友各得 50 积分</text>
      <text class="share__rules-item">2. 好友需通过您的专属链接注册</text>
      <text class="share__rules-item">3. 同一好友仅奖励一次</text>
    </view>
  </view>
</template>

<script>
import { copyText, makeInviteLink } from '@/utils/share'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'
import { useAuthStore } from '@/stores/auth'

export default {
  data() {
    return {
      stats: { invited: 0, earned: 0 }
    }
  },
  computed: {
    inviteLink() {
      const auth = useAuthStore()
      return makeInviteLink(auth.user?.id || 'me', auth.currentOrgId || 'org')
    }
  },
  methods: {
    async onCopy() {
      const ok = await copyText(this.inviteLink)
      haptic.tap()
      toast[ok ? 'success' : 'error'](ok ? '已复制到剪贴板' : '复制失败')
    },
    onShare() {
      // #ifdef MP-WEIXIN
      uni.showShareMenu({ withShareTicket: true })
      // #endif
      toast.text('分享功能即将上线,敬请期待')
    }
  }
}
</script>

<style lang="scss" scoped>
.share {
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

  &__card {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }

  &__row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-sm 0;
    border-bottom: 1rpx solid $divider-light;
    &:last-child {
      border-bottom: none;
    }
  }

  &__label {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__value {
    font-size: $font-md;
    color: $primary;
    font-weight: $font-weight-bold;
  }

  &__invite {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }

  &__invite-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  &__invite-link {
    padding: $spacing-sm;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: $font-xs;
    color: $text-secondary;
    word-break: break-all;
    margin-bottom: $spacing-md;
  }

  &__invite-actions {
    display: flex;
    gap: $spacing-sm;
  }

  &__invite-btn {
    flex: 1;
    padding: $spacing-sm;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    text-align: center;
    box-shadow: $shadow-button;

    & > text {
      color: #fff;
      font-size: $font-sm;
      font-weight: $font-weight-semibold;
    }
  }

  &__rules {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
  }

  &__rules-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  &__rules-item {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.8;
  }
}
</style>