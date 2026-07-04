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
      <!-- 2026-07-04: 顶部 "当前孩子" chip 与下方 kids 卡重复, 删; 切孩子直接在下方 kids 卡内 pill 操作 -->
    </view>

    <scroll-view scroll-y class="me__body">
      <!-- 2026-07-04 fix: scroll-view 在 H5 下 padding 不传给子节点, 用 wrapper 承载 (同 home.vue me__body-inner 模式) -->
      <view class="me__body-inner">

      <!-- 我的孩子 (2026-07-04: stats 区改成纵向 kid list, 多孩自动 list 下去, 不再有 + 管理卡) -->
      <view class="me__stats me__stats--kids">
        <view class="me__stats-label-row">
          <text class="me__stats-label">我的孩子</text>
          <text class="me__stats-meta">{{ students.length }} 位</text>
        </view>

        <view
          v-for="(kid, idx) in students"
          :key="kid.id"
          class="me__kid-row press"
          :class="{ 'me__kid-row--active': String(kid.id) === String(activeStudentId) }"
          @tap="onPickKid(kid)"
        >
          <view class="me__kid-row-avatar">
            <image v-if="kid.avatar" :src="kid.avatar" class="me__kid-row-img" mode="aspectFill" />
            <text v-else>{{ kidEmoji(kid) }}</text>
          </view>
          <view class="me__kid-row-main">
            <view class="me__kid-row-name-row">
              <text class="me__kid-row-name">{{ kid.name }}</text>
              <text v-if="String(kid.id) === String(activeStudentId)" class="me__kid-row-tag">
                当前
              </text>
            </view>
            <!-- 2026-07-04: 性别/年级/school 等 meta 删; school 是 ObjectId ref 没 populate 会暴露哈希串 -->
          </view>
          <text class="me__kid-row-arrow">›</text>
        </view>

        <view v-if="!students.length" class="me__stats-empty">
          <text>暂无孩子信息</text>
        </view>

        <!-- 2026-07-04: kids 卡内底部 3 stat (剩余课时 / 积分 / 近7天课程) — 跟首页顶部同款数据, 跳转对应详情页 -->
        <view class="me__kid-stats">
          <view class="me__kid-stat press" @tap="goStudentProducts">
            <text class="me__kid-stat-val">{{ stats.lessonsLeft || 0 }}</text>
            <text class="me__kid-stat-unit">节</text>
            <text class="me__kid-stat-lbl">剩余课时</text>
          </view>
          <view class="me__kid-stat-divider" />
          <view class="me__kid-stat press" @tap="goPoints">
            <text class="me__kid-stat-val">{{ stats.points || 0 }}</text>
            <text class="me__kid-stat-unit">分</text>
            <text class="me__kid-stat-lbl">剩余积分</text>
          </view>
          <view class="me__kid-stat-divider" />
          <view class="me__kid-stat press" @tap="goUpcoming">
            <text class="me__kid-stat-val">
              {{ upcoming.lessonCount }}
            </text>
            <text class="me__kid-stat-unit">节</text>
            <text class="me__kid-stat-lbl">近 7 天</text>
          </view>
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
import OrgFooter from '@/components/layout/OrgFooter.vue'
import { maskPhone } from '@/utils/format'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'
// 2026-07-04: kids 卡内 3 stat (剩余课时 / 积分 / 近 7 天课程) — 与首页 stats 同套 API
import { lessonScheduleApi } from '@/api/lessonSchedule'
import { pointsApi } from '@/api/points'
import { studentProductApi } from '@/api/studentProduct'

export default {
  components: { OrgFooter },
  data() {
    return {
      // 2026-07-04: 「设置与服务」折叠开关, 默认 false (用户需点击才展开)
      settingsExpanded: false,
      // 2026-07-04: kids 卡内 3 stat (剩余课时 / 积分 / 近 7 天课程)
      stats: { lessonsLeft: 0, points: 0 },
      // upcoming: label '有' / '无', lessonCount 数字
      upcoming: { lessonCount: 0, label: '无' }
    }
  },
  computed: {
    ...mapState(useAuthStore, ['user']),
    ...mapState(useStudentStore, ['activeStudentId', 'list']),
    auth() {
      return useAuthStore()
    },
    student() {
      return useStudentStore()
    },
    // 2026-07-04: 顶部 kids 横排; 没拉列表时退到空数组 (App.vue 已自动 fetch)
    students() {
      return Array.isArray(this.list) ? this.list : []
    },
    menus() {
      // (2026-07-04: 「分享得积分」加回 (低频但用户希望保留); 「我的订单」来自原 stats 升级;
      //              共 3 项改成 3 列等分)
      return [
        { label: '我的订单', icon: '📋', bg: '#E5F0FA', url: '/pages/order/list' },
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
    // 2026-07-04: 「我的孩子」列表 App.vue 已自动 fetch;
    // 3 stat (剩余课时 / 积分 / 近7天课程) 每次进入页面重新拉
    this.loadStats()
    this.loadUpcoming()
  },
  methods: {
    // 2026-07-04: kids 卡内 3 stat — 剩余课时 + 积分 (并行, 复用首页 stats 同款 API)
    async loadStats() {
      const tasks = []
      if (this.activeStudentId) {
        tasks.push(
          pointsApi.me()
            .then((r) => (this.stats.points = r?.balance || 0))
            .catch(() => {})
        )
      }
      tasks.push(
        studentProductApi
          .me({ isActive: true })
          .then((res) => {
            const items = Array.isArray(res) ? res : res?.items || res?.data || []
            this.stats.lessonsLeft = items.reduce((s, p) => s + (p.remainingLessons || 0), 0)
          })
          .catch(() => {})
      )
      await Promise.all(tasks)
    },

    // 近 7 天课程 (lessonScheduleApi.myCalendar today → today+6)
    async loadUpcoming() {
      try {
        const now = new Date()
        const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const next = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
        const res = await lessonScheduleApi.myCalendar({ from, to, isTrialLesson: false })
        let list = []
        if (Array.isArray(res)) list = res
        else if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        // 过滤 "已结束" 的; 简单按 plannedEndTime > now 算 (若服务端返了)
        const upcomingList = list.filter((l) => {
          if (!l.plannedStartTime) return true
          return new Date(l.plannedStartTime).getTime() >= now.getTime()
        })
        this.upcoming = {
          lessonCount: upcomingList.length,
          label: upcomingList.length > 0 ? '有' : '无'
        }
      } catch (e) {
        console.warn('[me.loadUpcoming]', e)
        this.upcoming = { lessonCount: 0, label: '无' }
      }
    },

    // 三个 stat 跳转
    goStudentProducts() {
      haptic.tap()
      uni.navigateTo({ url: '/pages/studentProduct/list' })
    },
    goPoints() {
      haptic.tap()
      uni.navigateTo({ url: '/pages/points/wallet' })
    },
    goUpcoming() {
      haptic.tap()
      uni.navigateTo({ url: '/pages/schedule/calendar' })
    },

    // 2026-07-04: 切到指定孩子 (重设 activeStudentId, store 持久化 + 全局响应)
    onPickKid(kid) {
      if (!kid || !kid.id) return
      haptic.tap()
      if (String(kid.id) === String(this.activeStudentId)) {
        // 已是当前孩子, 不重复切
        return
      }
      this.student.setActive(kid.id)
      uni.showToast({ title: `已切换到 ${kid.name}`, icon: 'none' })
    },

    // 头像 fallback emoji (name 哈希稳定选 avatar 池 — 跟 ActiveStudentHeader 一致)
    kidEmoji(kid) {
      const pool = ['🐰', '🐯', '🐻', '🦊', '🐼', '🐨', '🐸', '🐵', '🐱', '🐶']
      const name = (kid && kid.name) || ''
      let h = 0
      for (let i = 0; i < name.length; i++) {
        h = (h << 5) - h + name.charCodeAt(i)
        h |= 0
      }
      return pool[Math.abs(h) % pool.length]
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

  &__body {
    // 2026-07-04: padding 移到 wrapper 内层 (H5 scroll-view padding 不传给子节点, 同 home.vue)
    height: calc(100vh - 360rpx);
  }
  &__body-inner {
    padding: 0 $spacing-md;
  }

  &__stats {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }
  &__stats-label-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: $spacing-sm;
  }
  &__stats-label {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }
  &__stats-meta {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  // kids 纵向 list (2026-07-04 v2: 删 pill scroller + 管理卡, 多孩自动 list 下去)
  &__kid-row {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    padding: $spacing-sm $spacing-xs;
    border-top: 1rpx solid $divider-light;
    transition: background $transition-fast;
    &:first-child {
      border-top: none;
    }
    &:active {
      background: $divider-light;
    }
    &--active {
      background: $primary-lighter;
    }
  }
  &__kid-row-avatar {
    flex-shrink: 0;
    width: 80rpx;
    height: 80rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-light, $primary);
    @include flex-center;
    font-size: 40rpx;
    color: #fff;
    box-shadow: 0 4rpx 12rpx rgba(255, 138, 101, 0.18);
    overflow: hidden;
  }
  &__kid-row-img {
    width: 100%;
    height: 100%;
  }
  &__kid-row-main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  &__kid-row-name-row {
    display: flex;
    align-items: baseline;
    gap: $spacing-xs;
    margin-bottom: 4rpx;
  }
  &__kid-row-name {
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.3;
    @include multi-ellipsis(1);
  }
  &__kid-row-tag {
    flex-shrink: 0;
    padding: 0 10rpx;
    font-size: 20rpx;
    line-height: 1.5;
    border-radius: $radius-pill;
    background: $primary;
    color: #fff;
  }
  &__kid-row-arrow {
    flex-shrink: 0;
    font-size: 40rpx;
    color: $text-tertiary;
    line-height: 1;
  }
  &__stats-empty {
    padding: $spacing-md;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }

  // 2026-07-04: kids 卡内底部 3 stat 横排
  &__kid-stats {
    display: flex;
    align-items: center;
    margin-top: $spacing-md;
    padding-top: $spacing-md;
    border-top: 1rpx solid $divider-light;
  }
  &__kid-stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2rpx;
    transition: all $transition-fast;
    &:active {
      transform: scale(0.96);
    }
  }
  &__kid-stat-divider {
    width: 1rpx;
    height: 64rpx;
    background: $divider-light;
  }
  &__kid-stat-val {
    font-size: $font-3xl;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1.05;
  }
  &__kid-stat-unit {
    font-size: $font-xs;
    color: $text-tertiary;
    line-height: 1;
  }
  &__kid-stat-lbl {
    margin-top: 6rpx;
    font-size: $font-xs;
    color: $text-secondary;
    line-height: 1.2;
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
    // 2026-07-04: menu 3 项 (我的订单 / 分享得积分 / 常见问题), 改 3 列等分
    grid-template-columns: repeat(3, 1fr);
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