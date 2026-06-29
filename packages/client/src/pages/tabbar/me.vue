<!--
  我的 Tab - 个人中心 + 设置 + 客服入口
-->
<template>
  <view class="me">
    <view class="me__top">
      <view class="me__bg-circle me__bg-circle--1" />
      <view class="me__bg-circle me__bg-circle--2" />

      <view class="me__profile safe-area-top">
        <view class="me__avatar" @tap="onAvatar">
          <image
            v-if="auth.user && auth.user.avatar"
            class="me__avatar-img"
            :src="auth.user.avatar"
            mode="aspectFill"
          />
          <text v-else class="me__avatar-emoji">👤</text>
        </view>
        <view class="me__info">
          <text class="me__name">{{ auth.user?.realName || '家长' }}</text>
          <text class="me__phone">{{ maskPhone(auth.user?.mobile) }}</text>
        </view>
        <view class="me__edit press" @tap="onEdit">
          <text>编辑</text>
        </view>
      </view>

      <!-- 切换孩子 -->
      <view class="me__student">
        <active-student-header />
      </view>
    </view>

    <scroll-view scroll-y class="me__body">
      <!-- 学习数据 -->
      <view class="me__stats">
        <view class="me__stat press" @tap="goPage('/pages/studentProduct/list')">
          <text class="me__stat-val">{{ stats.lessonsLeft }}</text>
          <text class="me__stat-lbl">剩余课时</text>
        </view>
        <view class="me__stat press" @tap="goPage('/pages/order/list')">
          <text class="me__stat-val">{{ stats.orderCount }}</text>
          <text class="me__stat-lbl">订单数</text>
        </view>
        <view class="me__stat press" @tap="goPage('/pages/points/wallet')">
          <text class="me__stat-val">{{ stats.points }}</text>
          <text class="me__stat-lbl">积分</text>
        </view>
      </view>

      <!-- 功能入口 -->
      <view class="me__grid">
        <view
          v-for="item in menus"
          :key="item.label"
          class="me__menu press"
          @tap="onMenuTap(item)"
        >
          <view class="me__menu-icon" :style="{ background: item.bg }">
            <text class="me__menu-emoji">{{ item.icon }}</text>
          </view>
          <text class="me__menu-label">{{ item.label }}</text>
        </view>
      </view>

      <!-- 列表 -->
      <view class="me__list">
        <view class="me__list-title">设置与服务</view>
        <view
          v-for="item in settings"
          :key="item.label"
          class="me__list-item press"
          @tap="onMenuTap(item)"
        >
          <text class="me__list-emoji">{{ item.icon }}</text>
          <text class="me__list-label">{{ item.label }}</text>
          <text v-if="item.badge" class="me__list-badge">{{ item.badge }}</text>
          <text class="me__list-arrow">›</text>
        </view>
      </view>

      <view class="me__logout press" @tap="onLogout">
        <text>退出登录</text>
      </view>

      <org-footer />
      <view class="me__bottom-spacer" />
    </scroll-view>
  </view>
</template>

<script>
import { mapState } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import ActiveStudentHeader from '@/components/layout/ActiveStudentHeader.vue'
import OrgFooter from '@/components/layout/OrgFooter.vue'
import { pointsApi } from '@/api/points'
import { studentProductApi } from '@/api/studentProduct'
import { orderApi } from '@/api/order'
import { maskPhone } from '@/utils/format'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'

export default {
  components: { ActiveStudentHeader, OrgFooter },
  data() {
    return {
      stats: { lessonsLeft: 0, orderCount: 0, points: 0 }
    }
  },
  computed: {
    ...mapState(useAuthStore, ['user']),
    auth() {
      return useAuthStore()
    },
    menus() {
      return [
        { label: '接送授权', icon: '🚪', bg: '#C8F0DF', url: '/pages/access/pickups' },
        { label: '进出记录', icon: '📋', bg: '#E5F0FA', url: '/pages/access/events' },
        { label: '智能助手', icon: '🤖', bg: '#EDE3FA', url: '/pages/agent/chat' },
        { label: '机构主页', icon: '🏫', bg: '#FFE4D3', url: '/pages/org/home' },
        { label: '分享得积分', icon: '💌', bg: '#FFF1D0', url: '/pages/share/share' },
        { label: '协议条款', icon: '📜', bg: '#FFE4D3', url: '/pages/legal/list' },
        { label: '常见问题', icon: '❓', bg: '#C8F0DF', url: '/pages/help/faq' },
        { label: '联系我们', icon: '📞', bg: '#E5F0FA', url: '/pages/help/contact' }
      ]
    },
    settings() {
      return [
        { label: '学习画像', icon: '📊', url: '/pages/student/profile' },
        { label: '意见反馈', icon: '💬', url: '/pages/help/feedback' },
        { label: '隐私政策', icon: '🔒', url: '/pages/legal/detail?key=privacy-policy' },
        { label: '关于我们', icon: 'ℹ️', url: '/pages/legal/detail?key=user-agreement' },
        { label: '清除缓存', icon: '🧹', action: 'clearCache' }
      ]
    }
  },
  onShow() {
    this.loadStats()
  },
  methods: {
    async loadStats() {
      // 并行加载
      const tasks = []
      tasks.push(pointsApi.me().then((r) => (this.stats.points = r.balance || 0)).catch(() => {}))
      tasks.push(
        studentProductApi
          .list({ isActive: true })
          .then((res) => {
            const items = Array.isArray(res) ? res : res.items || res.data || []
            this.stats.lessonsLeft = items.reduce((s, p) => s + (p.remainingLessons || 0), 0)
          })
          .catch(() => {})
      )
      tasks.push(
        orderApi
          .list({ pageSize: 1 })
          .then((res) => {
            this.stats.orderCount = res.total || res.totalCount || 0
          })
          .catch(() => {})
      )
      await Promise.all(tasks)
    },

    onMenuTap(item) {
      haptic.tap()
      if (item.action === 'clearCache') return this.onClearCache()
      if (item.url) uni.navigateTo({ url: item.url })
    },

    onEdit() {
      uni.showToast({ title: '个人编辑待开发', icon: 'none' })
    },

    onAvatar() {
      uni.showActionSheet({
        itemList: ['从相册选择', '拍照'],
        success: (res) => {
          uni.showToast({ title: res.tapIndex === 0 ? '相册上传' : '拍照上传', icon: 'none' })
        }
      })
    },

    onClearCache() {
      uni.showModal({
        title: '清除缓存',
        content: '清除后,本地缓存将重置',
        success: async (res) => {
          if (!res.confirm) return
          uni.clearStorageSync()
          toast.success('已清除')
          setTimeout(() => uni.reLaunch({ url: '/pages/auth/login' }), 600)
        }
      })
    },

    onLogout() {
      uni.showModal({
        title: '退出登录',
        content: '确定要退出吗?',
        success: async (res) => {
          if (!res.confirm) return
          await this.auth.logout()
          haptic.success()
          uni.reLaunch({ url: '/pages/auth/login' })
        }
      })
    },

    goPage(url) {
      uni.navigateTo({ url })
    },

    maskPhone
  }
}
</script>

<style lang="scss" scoped>
.me {
  min-height: 100vh;
  background: $bg-page;

  &__top {
    background: linear-gradient(180deg, #FFB088 0%, #FFE4D3 60%, $bg-page 100%);
    padding-bottom: $spacing-md;
    position: relative;
    overflow: hidden;
  }

  &__bg-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.4;
    animation: float 6s ease-in-out infinite;
    pointer-events: none;

    &--1 {
      width: 260rpx;
      height: 260rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: -40rpx;
      right: -60rpx;
    }
    &--2 {
      width: 200rpx;
      height: 200rpx;
      background: radial-gradient(circle, #FFD0B8 0%, transparent 70%);
      top: 80rpx;
      left: -40rpx;
      animation-delay: 1.5s;
    }
  }

  &__profile {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    position: relative;
  }

  &__avatar {
    width: 128rpx;
    height: 128rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-light, $primary);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.3);
    margin-right: $spacing-md;
    overflow: hidden;
  }

  &__avatar-img {
    width: 100%;
    height: 100%;
  }

  &__avatar-emoji {
    font-size: 64rpx;
  }

  &__info {
    flex: 1;
  }

  &__name {
    display: block;
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }

  &__phone {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__edit {
    padding: $spacing-xs $spacing-md;
    background: rgba(255, 255, 255, 0.7);
    border-radius: $radius-pill;
    backdrop-filter: blur(8rpx);

    & > text {
      font-size: $font-xs;
      color: $text-primary;
    }
  }

  &__student {
    padding: 0 $spacing-md $spacing-md;
    position: relative;
  }

  &__body {
    padding: 0 $spacing-md;
    height: calc(100vh - 360rpx);
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md $spacing-sm;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }

  &__stat {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-sm $spacing-xs;

    &:active {
      transform: scale(0.96);
    }
  }

  &__stat-val {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1.2;
  }

  &__stat-lbl {
    font-size: $font-xs;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: $spacing-sm;
    margin-bottom: $spacing-md;
  }

  &__menu {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-sm $spacing-xs;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;

    &:active {
      transform: scale(0.95);
    }
  }

  &__menu-icon {
    width: 88rpx;
    height: 88rpx;
    border-radius: 22rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-xs;
  }

  &__menu-emoji {
    font-size: 44rpx;
  }

  &__menu-label {
    font-size: $font-xs;
    color: $text-primary;
    text-align: center;
  }

  &__list {
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    overflow: hidden;
    margin-bottom: $spacing-md;
  }

  &__list-title {
    padding: $spacing-sm $spacing-md;
    font-size: $font-xs;
    color: $text-secondary;
    background: $bg-page;
  }

  &__list-item {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    border-bottom: 1rpx solid $divider-light;
    transition: background $transition-fast;

    &:last-child {
      border-bottom: none;
    }

    &:active {
      background: $bg-page;
    }
  }

  &__list-emoji {
    font-size: 36rpx;
    margin-right: $spacing-md;
  }

  &__list-label {
    flex: 1;
    font-size: $font-base;
    color: $text-primary;
  }

  &__list-badge {
    padding: 2rpx 12rpx;
    background: $warning-light;
    color: $warning;
    font-size: $font-xs;
    border-radius: $radius-pill;
    margin-right: $spacing-sm;
  }

  &__list-arrow {
    font-size: 36rpx;
    color: $text-tertiary;
  }

  &__logout {
    @include flex-center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;

    & > text {
      font-size: $font-base;
      color: $warning;
      font-weight: $font-weight-medium;
    }
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>