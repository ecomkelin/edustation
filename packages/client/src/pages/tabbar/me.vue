<template>
  <view class="page">
    <view class="user-card card" v-if="user">
      <view class="avatar">{{ avatarChar }}</view>
      <view class="meta flex-1">
        <text class="name">{{ user.realName || '家长' }}</text>
        <text class="text-12 text-muted">{{ user.mobile }}</text>
      </view>
      <view class="tag" v-if="isPlatformAdmin">平台超管</view>
    </view>

    <active-student-header v-if="user" />

    <view class="grid">
      <view class="cell" @tap="go('/pages/order/list')">
        <text class="icon">📦</text>
        <text class="name">我的订单</text>
      </view>
      <view class="cell" @tap="go('/pages/studentProduct/list')">
        <text class="icon">🎟️</text>
        <text class="name">我的课包</text>
      </view>
      <view class="cell" @tap="go('/pages/courseEnrollment/list')">
        <text class="icon">📚</text>
        <text class="name">我的报名</text>
      </view>
      <view class="cell" @tap="go('/pages/studentWork/list')">
        <text class="icon">🖼️</text>
        <text class="name">作品墙</text>
      </view>
    </view>

    <view class="list card">
      <view class="row" @tap="go('/pages/points/transaction')">
        <text class="text-14 flex-1">积分流水</text>
        <text class="text-12 text-muted">›</text>
      </view>
      <view class="row" @tap="togglePush">
        <text class="text-14 flex-1">推送通知</text>
        <switch :checked="pushEnabled" color="#5B8FF9" />
      </view>
      <view class="row" @tap="go('/pages/points/exchange')">
        <text class="text-14 flex-1">积分商城</text>
        <text class="text-12 text-muted">›</text>
      </view>
    </view>

    <!-- 法律协议 + 机构主页 + FAQ + 联系客服 入口 (2026-06) -->
    <view class="list card">
      <view class="row" @tap="go('/pages/org/home')">
        <text class="icon-emoji">🏫</text>
        <text class="text-14 flex-1">关于本机构</text>
        <text class="text-12 text-muted">›</text>
      </view>
      <view class="row" @tap="go('/pages/legal/index')">
        <text class="icon-emoji">📜</text>
        <text class="text-14 flex-1">服务协议与隐私政策</text>
        <text class="text-12 text-muted">›</text>
      </view>
      <view class="row" @tap="go('/pages/help/faq')">
        <text class="icon-emoji">❓</text>
        <text class="text-14 flex-1">常见问题 FAQ</text>
        <text class="text-12 text-muted">›</text>
      </view>
      <view class="row" @tap="go('/pages/help/contact')">
        <text class="icon-emoji">📞</text>
        <text class="text-14 flex-1">联系客服</text>
        <text class="text-12 text-muted">›</text>
      </view>
    </view>

    <button class="btn-secondary" @tap="onLogout">退出登录</button>

    <view class="footer-license">
      <text v-if="siteConfig.copyrightLine">{{ siteConfig.copyrightLine }}</text>
      <text v-if="siteConfig.beianLine" class="beian">{{ siteConfig.beianLine }}</text>
      <text class="ver">EduStation Client v0.1.0</text>
    </view>
  </view>
</template>

<script>
import ActiveStudentHeader from '@/components/active-student-header.vue'
import { useAuthStore } from '@/stores/auth'
import { useSiteConfigStore } from '@/stores/siteConfig'
import { mapState } from 'pinia'
import { clearPushBinding, requestSubscribe } from '@/utils/push'

export default {
  components: { ActiveStudentHeader },
  data() {
    return { pushEnabled: true }
  },
  computed: {
    ...mapState(useAuthStore, ['user', 'isPlatformAdmin']),
    siteConfig() { return useSiteConfigStore() },
    avatarChar() {
      if (!this.user) return '👤'
      return (this.user.realName || this.user.mobile || 'U').slice(-2)
    }
  },
  onShow() {
    if (!this.user) {
      uni.reLaunch({ url: '/pages/auth/login' })
    }
  },
  methods: {
    go(url) { uni.navigateTo({ url }) },
    async onLogout() {
      const res = await uni.showModal({
        title: '确认退出?',
        content: '退出后将无法接收课程提醒'
      })
      if (!res.confirm) return
      const auth = useAuthStore()
      await auth.logout()
      clearPushBinding()
      uni.reLaunch({ url: '/pages/auth/login' })
    },
    async togglePush(e) {
      const next = e.detail.value
      this.pushEnabled = next
      if (next) {
        // #ifdef MP-WEIXIN
        // 申请订阅消息权限
        const tmplIds = uni.getStorageSync('wx_subscribe_tmpl_ids') || []
        if (tmplIds.length) await requestSubscribe(tmplIds)
        // #endif
        uni.showToast({ title: '已开启推送', icon: 'success' })
      } else {
        uni.showToast({ title: '已关闭推送', icon: 'none' })
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.user-card {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 24rpx;
  .avatar {
    width: 96rpx;
    height: 96rpx;
    border-radius: 50%;
    background: #5B8FF9;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 32rpx;
    font-weight: 600;
  }
  .meta { display: flex; flex-direction: column; gap: 4rpx; }
  .name { font-size: 32rpx; font-weight: 600; }
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  margin: 16rpx 0;
  .cell {
    flex: 0 0 calc(50% - 8rpx);
    background: #ffffff;
    border-radius: 16rpx;
    padding: 32rpx 24rpx;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    .icon { font-size: 56rpx; }
    .name { font-size: 28rpx; }
  }
}
.list {
  .row {
    display: flex;
    align-items: center;
    gap: 16rpx;
    padding: 24rpx 0;
    border-bottom: 1rpx solid #f3f4f6;
    &:last-child { border-bottom: none; }
    .icon-emoji { font-size: 32rpx; }
  }
}
.footer-license {
  margin-top: 32rpx;
  padding: 16rpx 0;
  text-align: center;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.7;
  .beian { display: block; }
  .ver { display: block; margin-top: 8rpx; color: #c0c4cc; }
}
</style>
