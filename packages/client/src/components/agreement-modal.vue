<template>
  <view v-if="visible" class="mask">
    <view class="modal">
      <view class="header">
        <text class="title">请阅读并同意以下协议</text>
        <text class="hint">协议有更新,需要您重新确认才可继续使用</text>
      </view>

      <scroll-view scroll-y class="body">
        <view
          v-for="doc in (auth.pendingConsents || [])"
          :key="doc.key + '-' + doc.version"
          class="doc"
        >
          <view class="doc-title">
            <text class="t">{{ doc.title }}</text>
            <text class="tag">{{ doc.type === 'platform' ? '平台' : '本机构' }} · v{{ doc.version }}</text>
          </view>
          <view v-if="doc.summary" class="doc-summary">{{ doc.summary }}</view>
          <rich-text class="doc-content" :nodes="doc.html || ''" />
        </view>
      </scroll-view>

      <view class="footer">
        <view class="agree-row" @tap="agreed = !agreed">
          <view class="checkbox" :class="{ checked: agreed }">
            <text v-if="agreed">✓</text>
          </view>
          <text class="agree-text">我已阅读并同意以上 {{ (auth.pendingConsents || []).length }} 份协议</text>
        </view>
        <view class="btns">
          <button class="btn-secondary" :disabled="submitting" @tap="onReject">不同意,退出</button>
          <button class="btn-primary" :disabled="!agreed || submitting" :loading="submitting" @tap="onAccept">
            同意并继续
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { useAuthStore } from '@/stores/auth'
import { legalApi } from '@/api/legal'

/**
 * 法律协议强制接受全屏 modal.
 *
 * 由 App.vue watch auth.pendingConsents 长度 > 0 时控制 visible.
 * 用户必须全部勾选才能继续使用 app; 不同意直接走 logout + 跳登录页.
 */
export default {
  data() {
    return {
      agreed: false,
      submitting: false
    }
  },
  computed: {
    auth() { return useAuthStore() },
    visible() {
      // 仅登录后才弹; 未登录时跑登录流程, 没必要拦截
      return this.auth.isAuthenticated && this.auth.hasPendingConsents
    }
  },
  methods: {
    async onAccept() {
      if (!this.agreed) return
      this.submitting = true
      try {
        const consents = (this.auth.pendingConsents || []).map((d) => ({
          key: d.key,
          type: d.type,
          version: d.version,
          // 机构级 consent 必须带 org
          org: d.type === 'org' ? this.auth.currentOrgId : undefined
        }))
        await legalApi.recordConsent({ consents })
        this.auth.clearPendingConsents()
        uni.showToast({ title: '已记录您的同意', icon: 'success' })
      } catch (e) {
        // request.js 已弹错误 toast
      } finally {
        this.submitting = false
      }
    },
    async onReject() {
      const r = await uni.showModal({
        title: '确认不同意?',
        content: '不同意协议将退出登录,您可重新启动 app 再阅读'
      })
      if (!r.confirm) return
      await this.auth.logout()
      uni.reLaunch({ url: '/pages/auth/login' })
    }
  }
}
</script>

<style lang="scss" scoped>
.mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.modal {
  width: 92%;
  max-width: 700rpx;
  max-height: 88vh;
  background: #fff;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.header {
  padding: 32rpx 32rpx 16rpx;
  border-bottom: 1rpx solid #f3f4f6;
  .title {
    display: block;
    font-size: 34rpx;
    font-weight: 600;
    color: #1f2937;
  }
  .hint {
    display: block;
    margin-top: 8rpx;
    font-size: 24rpx;
    color: #f97316;
  }
}
.body {
  flex: 1;
  padding: 16rpx 32rpx;
  overflow-y: auto;
}
.doc {
  padding: 16rpx 0;
  border-bottom: 1rpx dashed #e5e7eb;
  &:last-child { border-bottom: none; }
}
.doc-title {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
  .t { font-size: 28rpx; font-weight: 600; color: #1f2937; }
  .tag {
    background: #eef2ff;
    color: #5B8FF9;
    font-size: 22rpx;
    padding: 2rpx 10rpx;
    border-radius: 6rpx;
  }
}
.doc-summary {
  padding: 8rpx 12rpx;
  background: #fafafa;
  border-left: 3rpx solid #5B8FF9;
  font-size: 24rpx;
  color: #4b5563;
  margin-bottom: 8rpx;
}
.doc-content {
  font-size: 26rpx;
  line-height: 1.7;
  color: #374151;
}
.footer {
  padding: 16rpx 32rpx 24rpx;
  border-top: 1rpx solid #f3f4f6;
  background: #fffbeb;
}
.agree-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 12rpx 0;
  .checkbox {
    width: 36rpx;
    height: 36rpx;
    border: 2rpx solid #d1d5db;
    border-radius: 6rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    color: transparent;
    &.checked {
      background: #5B8FF9;
      border-color: #5B8FF9;
      color: #fff;
    }
  }
  .agree-text { font-size: 26rpx; color: #1f2937; }
}
.btns {
  display: flex;
  gap: 16rpx;
  margin-top: 16rpx;
  button { flex: 1; }
}
</style>
