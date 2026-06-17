<template>
  <view class="login-page">
    <view class="brand">
      <view class="logo">🎓</view>
      <text class="title">EduStation</text>
      <text class="subtitle">校外培训管理 · 家长端</text>
    </view>

    <view class="form card">
      <view class="form-item">
        <text class="label">手机号</text>
        <input
          v-model="form.mobile"
          class="input"
          type="number"
          maxlength="11"
          placeholder="请输入手机号"
          :disabled="submitting"
        />
      </view>
      <view class="form-item">
        <text class="label">密码</text>
        <input
          v-model="form.password"
          class="input"
          :type="showPwd ? 'text' : 'password'"
          placeholder="请输入密码"
          :disabled="submitting"
        />
        <text class="toggle-pwd" @tap="showPwd = !showPwd">{{ showPwd ? '隐藏' : '显示' }}</text>
      </view>

      <view class="agreement-row" @tap="agreed = !agreed">
        <view class="checkbox" :class="{ checked: agreed }">
          <text v-if="agreed">✓</text>
        </view>
        <text class="agreement-text">
          我已阅读并同意
          <text class="link" @tap.stop="openAgreement('user-agreement')">《用户协议》</text>
          和
          <text class="link" @tap.stop="openAgreement('privacy-policy')">《隐私政策》</text>
        </text>
      </view>

      <button
        class="btn-primary login-btn"
        :loading="submitting"
        :disabled="submitting || !agreed"
        @tap="handleLogin"
      >登录</button>
    </view>

    <view class="footer-tip">
      <text>忘记密码?请联系机构管理员重置</text>
    </view>

    <view class="footer-beian">
      <text v-if="siteConfig.copyrightLine">{{ siteConfig.copyrightLine }}</text>
      <text v-if="siteConfig.beianLine" class="beian">{{ siteConfig.beianLine }}</text>
    </view>
  </view>
</template>

<script>
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import { useSiteConfigStore } from '@/stores/siteConfig'
import { initPush } from '@/utils/push'
import { isValidMobile } from '@/utils/format'
import { mapState } from 'pinia'

export default {
  data() {
    return {
      form: { mobile: '', password: '' },
      submitting: false,
      showPwd: false,
      agreed: false
    }
  },
  computed: {
    siteConfig() { return useSiteConfigStore() }
  },
  onLoad() {
    // 已登录则直接跳到首页
    const auth = useAuthStore()
    if (auth.isAuthenticated) {
      uni.reLaunch({ url: '/pages/tabbar/home' })
    }
  },
  methods: {
    openAgreement(key) {
      uni.navigateTo({ url: `/pages/legal/detail?key=${key}&scope=platform` })
    },
    async handleLogin() {
      if (!isValidMobile(this.form.mobile)) {
        return uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
      }
      if (!this.form.password || this.form.password.length < 6) {
        return uni.showToast({ title: '密码至少 6 位', icon: 'none' })
      }
      if (!this.agreed) {
        return uni.showToast({ title: '请先勾选协议', icon: 'none' })
      }
      this.submitting = true
      try {
        const auth = useAuthStore()
        await auth.login({ mobile: this.form.mobile, password: this.form.password })
        // 拉取孩子
        const student = useStudentStore()
        try {
          await student.fetchMyStudents()
        } catch (_) {
          student.clear()
        }
        // 初始化推送(登录后才能拿到稳定的 clientId)
        try { initPush() } catch (_) {}
        uni.showToast({ title: '登录成功', icon: 'success' })
        // 注意:home.vue 会挂载 <agreement-modal>, 落地时若 pendingConsents > 0 会自动弹层强制接受
        setTimeout(() => uni.reLaunch({ url: '/pages/tabbar/home' }), 400)
      } catch (_) {
        // request.js 已经统一 toast
      } finally {
        this.submitting = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  padding: 80rpx 48rpx 48rpx;
  background: linear-gradient(180deg, #eef4ff 0%, #f7f8fa 50%);
  display: flex;
  flex-direction: column;
}
.brand {
  text-align: center;
  margin-bottom: 80rpx;
  .logo {
    font-size: 96rpx;
    line-height: 1;
    margin-bottom: 16rpx;
  }
  .title {
    display: block;
    font-size: 48rpx;
    font-weight: 600;
    color: #1f2937;
  }
  .subtitle {
    display: block;
    margin-top: 8rpx;
    font-size: 26rpx;
    color: #6b7280;
  }
}
.form {
  padding: 32rpx;
}
.form-item {
  position: relative;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #e5e7eb;
  .label {
    display: block;
    font-size: 24rpx;
    color: #6b7280;
    margin-bottom: 8rpx;
  }
  .input {
    width: 100%;
    font-size: 32rpx;
    color: #1f2937;
    padding: 8rpx 0;
  }
  .toggle-pwd {
    position: absolute;
    right: 0;
    bottom: 24rpx;
    font-size: 24rpx;
    color: #5B8FF9;
    padding: 8rpx;
  }
}
.agreement-row {
  display: flex;
  align-items: flex-start;
  gap: 12rpx;
  padding: 20rpx 0 0;
  .checkbox {
    flex-shrink: 0;
    width: 32rpx;
    height: 32rpx;
    margin-top: 2rpx;
    border: 2rpx solid #d1d5db;
    border-radius: 6rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    color: transparent;
    font-size: 24rpx;
    &.checked {
      background: #5B8FF9;
      border-color: #5B8FF9;
      color: #fff;
    }
  }
  .agreement-text {
    font-size: 24rpx;
    color: #6b7280;
    line-height: 1.6;
    .link { color: #5B8FF9; }
  }
}
.login-btn {
  margin-top: 32rpx;
  width: 100%;
}
.login-btn[disabled] { opacity: 0.5; }
.footer-tip {
  margin-top: 48rpx;
  text-align: center;
  font-size: 24rpx;
  color: #9ca3af;
}
.footer-beian {
  margin-top: auto;
  padding-top: 32rpx;
  text-align: center;
  font-size: 22rpx;
  color: #9ca3af;
  line-height: 1.6;
  .beian { display: block; margin-top: 4rpx; }
}
</style>
