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
      <!-- 2026-07-04 fix: scroll-view 在 H5 下 padding 不传给子节点, 用 wrapper 承载 (同 home.vue me__body-inner 模式) -->
      <view class="me__body-inner">

      <!-- 学习数据 (2026-07-04: 删「我的课程」入口; 只剩订单数, 改单列居中) -->
      <view class="me__stats me__stats--single">
        <view class="me__stat press" @tap="goPage('/pages/order/list')">
          <text class="me__stat-val">{{ stats.orderCount }}</text>
          <text class="me__stat-lbl">订单数</text>
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

      <!-- 列表 (2026-07-04: 「设置与服务」改成可折叠 header, 默认折叠, 点击展开子项) -->
      <view class="me__list">
        <view class="me__list-title me__list-title--toggle press" @tap="toggleSettings">
          <text>设置与服务</text>
          <text class="me__list-arrow" :class="{ 'me__list-arrow--up': settingsExpanded }">›</text>
        </view>
        <view v-if="settingsExpanded">
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
      </view>

      <view class="me__logout press" @tap="onLogout">
        <text>退出登录</text>
      </view>

      <org-footer />
      <view class="me__bottom-spacer" />
      </view>
    </scroll-view>
  </view>
</template>

<script>
import { mapState } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import ActiveStudentHeader from '@/components/layout/ActiveStudentHeader.vue'
import OrgFooter from '@/components/layout/OrgFooter.vue'
import { orderApi } from '@/api/order'
import { maskPhone } from '@/utils/format'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'

export default {
  components: { ActiveStudentHeader, OrgFooter },
  data() {
    return {
      stats: { orderCount: 0 },
      // 2026-07-04: 「设置与服务」折叠开关, 默认 false (用户需点击才展开)
      settingsExpanded: false
    }
  },
  computed: {
    ...mapState(useAuthStore, ['user']),
    ...mapState(useStudentStore, ['activeStudentId']),
    auth() {
      return useAuthStore()
    },
    student() {
      return useStudentStore()
    },
    menus() {
      // (2026-07-02 4 tab 重构) 智能助手 → tab2 chat.vue; 机构主页 → tab3 org.vue
      // (2026-07-04: 删「联系我们」入口 — 联系方式走机构主页 R-0932, 已在 /pages/org/home 顶部 + 底部 section)
      // (2026-07-04: 删「接送授权」「进出记录」「协议条款」— 收到"设置与服务"折叠区, 顶层 menu 只保留高频入口)
      return [
        { label: '我的孩子', icon: '👨‍👩‍👧', bg: '#FFE4D3', url: '/pages/student/switch' },
        { label: '分享得积分', icon: '💌', bg: '#FFF1D0', url: '/pages/share/share' },
        { label: '常见问题', icon: '❓', bg: '#C8F0DF', url: '/pages/help/faq' }
      ]
    },
    settings() {
      // (2026-07-04: 删「学习画像」— 改放首页; 删「清除缓存」— 用户认为没必要)
      // (2026-07-04: 菜单并入折叠组 — 接送授权 / 进出记录 / 协议条款 移到这里, 默认折叠, 点击"设置与服务"才显示)
      return [
        { label: '接送授权', icon: '🚪', url: '/pages/access/pickups' },
        { label: '进出记录', icon: '📋', url: '/pages/access/events' },
        { label: '协议条款', icon: '📜', url: '/pages/legal/list' },
        { label: '意见反馈', icon: '💬', url: '/pages/help/feedback' },
        { label: '隐私政策', icon: '🔒', url: '/pages/legal/detail?key=privacy-policy' },
        { label: '关于我们', icon: 'ℹ️', url: '/pages/legal/detail?key=user-agreement' }
      ]
    }
  },
  onShow() {
    this.loadStats()
  },
  methods: {
    async loadStats() {
      // 2026-07-03: 剩余课时 + 积分 移到首页顶部 (孩子维度); 这里只保留订单数
      try {
        const res = await orderApi.me({ pageSize: 1 })
        this.stats.orderCount = res?.total || res?.totalCount || 0
      } catch (e) {
        console.warn('[me.loadStats] orderApi.me', e)
      }
    },

    onMenuTap(item) {
      haptic.tap()
      if (item.url) uni.navigateTo({ url: item.url })
    },

    // 2026-07-04: 折叠 "设置与服务" 区 (haptic 反馈跟 onMenuTap 一致)
    toggleSettings() {
      haptic.tap()
      this.settingsExpanded = !this.settingsExpanded
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
    // 2026-07-04: padding 移到 wrapper 内层 (H5 scroll-view padding 不传给子节点, 同 home.vue)
    height: calc(100vh - 360rpx);
  }
  &__body-inner {
    padding: 0 $spacing-md;
  }

  &__stats {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md $spacing-sm;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }
  // 2026-07-04: 「我的课程」删除后只剩订单数, 改单列居中
  &__stats--single {
    grid-template-columns: 1fr;
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
  // 2026-07-04: 折叠 toggle header — 「设置与服务」点击展开子项, 默认折叠
  &__list-title--toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    transition: background $transition-fast;
    &:active {
      background: $divider-light;
    }
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
  // 2026-07-04: 折叠 header 箭头: 展开时逆时针 90 度 (从右变下)
  &__list-arrow--up {
    display: inline-block;
    transform: rotate(-90deg);
    transform-origin: center;
    transition: transform $transition-base;
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