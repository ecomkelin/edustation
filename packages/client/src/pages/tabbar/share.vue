<template>
  <view class="page">
    <view class="hero card">
      <text class="title">分享得积分</text>
      <text class="subtitle">每分享 1 次可获得 10 积分，分享到朋友圈翻倍</text>
    </view>

    <view class="card">
      <text class="text-16 text-strong">分享到</text>
      <view class="divider" />
      <view class="grid">
        <view class="cell" @tap="share('weixin')">
          <text class="icon">💬</text>
          <text class="name">微信好友</text>
          <text class="reward">+10</text>
        </view>
        <view class="cell" @tap="share('timeline')">
          <text class="icon">📱</text>
          <text class="name">朋友圈</text>
          <text class="reward">+20</text>
        </view>
        <view class="cell" @tap="copyLink">
          <text class="icon">🔗</text>
          <text class="name">复制链接</text>
          <text class="reward">+5</text>
        </view>
        <view class="cell" @tap="poster()">
          <text class="icon">🖼️</text>
          <text class="name">生成海报</text>
          <text class="reward">+15</text>
        </view>
      </view>
    </view>

    <view class="card">
      <text class="text-16 text-strong">最近分享记录</text>
      <view class="divider" />
      <view v-if="!recent.length" class="text-12 text-muted">暂无分享记录，去分享给好友吧～</view>
      <view v-else>
        <view v-for="(r, i) in recent" :key="i" class="row">
          <text class="text-14">{{ r.sceneLabel }}</text>
          <text class="text-12 text-muted">{{ r.timeLabel }}</text>
          <text class="reward-text">+{{ r.amount }}</text>
        </view>
      </view>
    </view>

    <view class="card">
      <text class="text-16 text-strong">分享文案参考</text>
      <view class="divider" />
      <view class="copy-block" @tap="copyText">
        <text>{{ defaultText }}</text>
      </view>
      <text class="text-12 text-muted">点击文案区域复制</text>
    </view>
  </view>
</template>

<script>
import { shareToWeixin, copyInviteLink, reportShareSuccess } from '@/utils/share'
import { formatRelativeTime, formatDateTime } from '@/utils/format'

const REWARD = { weixin: 10, timeline: 20, copy: 5, poster: 15 }
const SCENE_LABEL = {
  weixin: '微信好友',
  timeline: '朋友圈',
  copy: '复制链接',
  poster: '生成海报'
}

export default {
  data() {
    return {
      recent: [],
      defaultText: '我在 EduStation 学习，孩子进步看得见！一起加入我们吧～'
    }
  },
  methods: {
    async share(scene) {
      // #ifdef MP-WEIXIN
      const ok = await shareToWeixin({ title: 'EduStation', path: '/pages/tabbar/home' })
      if (ok) this.recordShare(scene)
      // #endif
      // #ifdef APP-PLUS
      uni.share({
        provider: scene === 'timeline' ? 'weixin' : 'weixin',
        scene: scene === 'timeline' ? 'WXSenceTimeline' : 'WXSceneSession',
        type: 0,
        title: 'EduStation',
        summary: this.defaultText,
        href: 'https://example.com',
        success: () => this.recordShare(scene)
      })
      // #endif
      // #ifdef H5
      // H5 没有原生分享 -> 退化为复制链接
      this.copyLink()
      // #endif
    },
    async copyLink() {
      const trackId = 'sh_' + Date.now()
      const ok = await copyInviteLink('https://example.com/invite', trackId)
      if (ok) {
        this.recordShare('copy', trackId)
        uni.showToast({ title: '已复制邀请链接', icon: 'success' })
      }
    },
    async poster() {
      uni.showToast({ title: '生成海报功能开发中', icon: 'none' })
    },
    async recordShare(scene, refId) {
      const amount = REWARD[scene] || 0
      this.recent.unshift({
        sceneLabel: SCENE_LABEL[scene] || scene,
        timeLabel: formatRelativeTime(new Date()),
        amount
      })
      if (this.recent.length > 10) this.recent = this.recent.slice(0, 10)
      // 上报后端（阶段 2 stub：不真入账）
      reportShareSuccess({ scene, refId }).catch(() => null)
    },
    copyText() {
      uni.setClipboardData({
        data: this.defaultText,
        success: () => uni.showToast({ title: '已复制', icon: 'success' })
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.hero {
  background: linear-gradient(135deg, #FF9A6C 0%, #FFB68A 100%);
  color: #fff;
  padding: 40rpx 24rpx;
  .title { font-size: 40rpx; font-weight: 700; display: block; }
  .subtitle { font-size: 26rpx; opacity: 0.9; display: block; margin-top: 8rpx; }
}
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16rpx;
  .cell {
    flex: 0 0 calc(50% - 8rpx);
    background: #f9fafb;
    border-radius: 12rpx;
    padding: 24rpx;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    .icon { font-size: 64rpx; }
    .name { font-size: 28rpx; font-weight: 600; }
    .reward { font-size: 22rpx; color: #f5222d; }
  }
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-child { border-bottom: none; }
  .reward-text { color: #f5222d; font-weight: 600; }
}
.copy-block {
  background: #f9fafb;
  padding: 24rpx;
  border-radius: 12rpx;
  margin-bottom: 12rpx;
  line-height: 1.6;
  color: #374151;
}
</style>
