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
          <SvgAvatar
            :svg-key="(auth.user && auth.user.avatarSvgKey) || 'mom'"
            :size="64"
            audience="user"
            clickable
            @click="onAvatar"
          />
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

      <!-- 2026-07-05: 功能入口上移到 kids 之前 (用户原话「把我画红框的模块放到我的孩子上面」) -->
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

      <!-- 我的孩子 (2026-07-05: 每个 kid 一个独立 card 自带 3 stat — 走 R-0473 一次性聚合, 不切换 activeStudent) -->
      <view class="me__kid-cards">
        <view class="me__kid-cards-head">
          <text class="me__kid-cards-title">我的孩子</text>
          <text class="me__kid-cards-meta">{{ kidStats.length }} 位</text>
        </view>

        <view
          v-for="kid in kidStats"
          :key="kid.id"
          class="me__kid-card"
          :class="{ 'me__kid-card--active': String(kid.id) === String(activeStudentId) }"
        >
          <view class="me__kid-card-head">
            <view class="me__kid-card-avatar">
              <SvgAvatar
                :svg-key="kid.avatarSvgKey || null"
                :size="44"
                audience="student"
              />
            </view>
            <view class="me__kid-card-info">
              <view class="me__kid-card-name-row">
                <text class="me__kid-card-name">{{ kid.name }}</text>
                <!-- 2026-07-05: 移除「当前」药丸 tag, 用 me__kid-card--active 主色渐变背景标识当前孩子 (更净) -->
              </view>
              <!-- 2026-07-05: 显示孩子所属机构 (跟学生名字同 row, 卡片头部最右侧)
                   后端 listMyKidsStats 已 populate org.name, 没绑/孤儿时降级 "未关联机构" -->
            </view>
            <text class="me__kid-card-org">🏫 {{ kid.orgName || '未关联机构' }}</text>
          </view>

          <!-- kid 自带 3 stat (剩余课时 / 积分 / 近 7 天课程) — 与 kid 一一对应, 不是全局当前孩子 -->
          <view class="me__kid-card-stats">
            <view class="me__kid-card-stat press" @tap="goStudentProducts(kid.id)">
              <text class="me__kid-card-stat-val">{{ kid.stats.lessonsLeft || 0 }}</text>
              <text class="me__kid-card-stat-unit">节</text>
              <text class="me__kid-card-stat-lbl">剩余课时</text>
            </view>
            <view class="me__kid-card-stat-divider" />
            <view class="me__kid-card-stat press" @tap="goPoints(kid.id)">
              <text class="me__kid-card-stat-val">{{ kid.stats.points || 0 }}</text>
              <text class="me__kid-card-stat-unit">分</text>
              <text class="me__kid-card-stat-lbl">剩余积分</text>
            </view>
            <view class="me__kid-card-stat-divider" />
            <view class="me__kid-card-stat press" @tap="goCalendar(kid.id)">
              <text class="me__kid-card-stat-val">{{ kid.stats.upcoming || 0 }}</text>
              <text class="me__kid-card-stat-unit">节</text>
              <text class="me__kid-card-stat-lbl">近 7 天</text>
            </view>
          </view>
        </view>

        <view v-if="!kidStats.length && !kidStatsLoading" class="me__kid-cards-empty">
          <text class="me__kid-cards-empty-emoji">📭</text>
          <text class="me__kid-cards-empty-title">还没有关联孩子</text>
          <text class="me__kid-cards-empty-desc">请联系机构添加您的孩子 ›</text>
        </view>
        <view v-if="kidStatsLoading && !kidStats.length" class="me__kid-cards-loading">
          <text>召唤中…</text>
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
import { haptic } from '@/utils/haptic'
// 2026-07-05: kids-card 自带 stat 走 R-0473 一次性聚合 (跨 kid 不强制 activeStudent)
import { studentApi } from '@/api/student'
import SvgAvatar from '@/components/Avatar/SvgAvatar.vue'

export default {
  components: { OrgFooter, SvgAvatar },
  data() {
    return {
      // 2026-07-04: 「设置与服务」折叠开关, 默认 false (用户需点击才展开)
      settingsExpanded: false,
      // 2026-07-05: R-0473 拉来的 kid + stat 列表 (kidStats = [{id, name, avatarSvgKey, stats: {lessonsLeft, points, upcoming}}])
      kidStats: [],
      kidStatsLoading: false
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
    menus() {
      // (2026-07-04: 「分享得积分」加回; 「我的订单」来自原 stats 升级; 3 项 3 列等分)
      return [
        { label: '我的订单', icon: '📋', bg: '#E5F0FA', url: '/pages/order/list' },
        { label: '分享得积分', icon: '💌', bg: '#FFF1D0', url: '/pages/share/share' },
        { label: '常见问题', icon: '❓', bg: '#C8F0DF', url: '/pages/help/faq' }
      ]
    },
    settings() {
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
    // 2026-07-05: kids-card 渲染来自 R-0473 聚合, 每次进入刷新
    this.loadKidStats()
  },
  methods: {
    // 2026-07-05: 拉多个 kid + 各自的 stat (剩余课时 / 积分 / 近 7 天) — 一次请求搞定
    async loadKidStats() {
      this.kidStatsLoading = true
      try {
        const res = await studentApi.statsMyKids()
        const items = res?.items || []
        this.kidStats = items.map((x) => ({
          id: x.id,
          name: x.name,
          gender: x.gender,
          // 2026-07-05: avatar → avatarSvgKey (DB 只存 enum key)
          avatarSvgKey: x.avatarSvgKey || null,
          // 2026-07-05: 后端 listMyKidsStats populate 了 org, 给前端 kid-card 头部右侧红框位置展示「孩子所属机构」
          orgId: x.orgId || null,
          orgName: x.orgName || '',
          stats: {
            lessonsLeft: x.stats?.lessonsLeft || 0,
            points: x.stats?.points || 0,
            upcoming: x.stats?.upcoming || 0
          }
        }))
      } catch (e) {
        console.warn('[me.loadKidStats]', e)
        this.kidStats = []
      } finally {
        this.kidStatsLoading = false
      }
    },

    // 3 stat 跳转 — 2026-07-05 用户原话「这页面不许换孩子」: 详情页入参 `?kid=xxx` 让对应 kid 数据展示, 不动 activeStudent
    goStudentProducts(kidId) {
      haptic.tap()
      if (!kidId) {
        uni.showToast({ title: '请先选择孩子', icon: 'none' })
        return
      }
      uni.navigateTo({ url: `/pages/studentProduct/list?kid=${kidId}` })
    },
    goPoints(kidId) {
      haptic.tap()
      if (!kidId) {
        uni.showToast({ title: '请先选择孩子', icon: 'none' })
        return
      }
      uni.navigateTo({ url: `/pages/points/wallet?kid=${kidId}` })
    },
    goCalendar(kidId) {
      haptic.tap()
      if (!kidId) {
        uni.showToast({ title: '请先选择孩子', icon: 'none' })
        return
      }
      uni.navigateTo({ url: `/pages/schedule/calendar?kid=${kidId}` })
    },

    // 2026-07-05: kidEmoji 已弃用, 直接用 SvgAvatar 渲染; fallback 改走 utils/avatarFallback

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
      // 2026-07-05: 改为跳 SVG 头像 picker 页面 (4 个预制头像)
      uni.navigateTo({ url: '/pages/profile/avatars' })
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

  // 2026-07-05: kids-card 模式 — 每个 kid 一个独立卡自带 3 stat
  &__kid-cards {
    margin-bottom: $spacing-md;
  }
  &__kid-cards-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding: 0 $spacing-xs $spacing-sm;
  }
  &__kid-cards-title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }
  &__kid-cards-meta {
    font-size: $font-xs;
    color: $text-tertiary;
  }
  &__kid-cards-empty,
  &__kid-cards-loading {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-xl $spacing-md;
    box-shadow: $shadow-card;
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
  }
  &__kid-cards-empty {
    @include flex-center;
    flex-direction: column;
  }
  &__kid-cards-empty-emoji {
    font-size: 64rpx;
    margin-bottom: $spacing-sm;
  }
  &__kid-cards-empty-title {
    font-size: $font-base;
    font-weight: $font-weight-medium;
    color: $text-primary;
    margin-bottom: 4rpx;
  }
  &__kid-cards-empty-desc {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__kid-card {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-sm;
    transition: background $transition-fast;
    &--active {
      background: linear-gradient(135deg, rgba($primary, 0.04), $primary-lighter);
      box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.18);
    }
  }
  &__kid-card-head {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    margin-bottom: $spacing-md;
  }
  &__kid-card-avatar {
    flex-shrink: 0;
    width: 88rpx;
    height: 88rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary-light, $primary);
    @include flex-center;
    font-size: 44rpx;
    box-shadow: 0 4rpx 12rpx rgba(255, 138, 101, 0.22);
    overflow: hidden;
  }
  &__kid-card-emoji {
    color: #fff;
  }
  &__kid-card-img {
    width: 100%;
    height: 100%;
  }
  &__kid-card-info {
    flex: 1;
    min-width: 0;
  }
  // 2026-07-05: kid-card 头部最右侧红框位置, 显示孩子所属机构 (跟 name 同 row)
  &__kid-card-org {
    flex-shrink: 0;
    max-width: 48%;
    font-size: $font-sm;
    color: $text-secondary;
    padding: 6rpx 16rpx;
    background: rgba(255, 138, 101, 0.10);
    border-radius: $radius-pill;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }
  &__kid-card-name-row {
    display: flex;
    align-items: baseline;
    gap: $spacing-xs;
  }
  &__kid-card-name {
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $text-primary;
    line-height: 1.3;
    @include multi-ellipsis(1);
  }

  // kid 自带 3 stat 横排
  &__kid-card-stats {
    display: flex;
    align-items: center;
    background: $bg-page;
    border-radius: $radius-sm;
    padding: $spacing-sm $spacing-xs;
  }
  &__kid-card-stat {
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
  &__kid-card-stat-divider {
    width: 1rpx;
    height: 56rpx;
    background: $divider-light;
  }
  &__kid-card-stat-val {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $primary;
    line-height: 1.05;
  }
  &__kid-card-stat-unit {
    font-size: 20rpx;
    color: $text-tertiary;
    line-height: 1;
  }
  &__kid-card-stat-lbl {
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