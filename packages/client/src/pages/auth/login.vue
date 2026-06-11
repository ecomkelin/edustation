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
      <button class="btn-primary" :loading="submitting" :disabled="submitting" @tap="handleLogin">
        登录
      </button>

      <view class="tips">
        <text>登录即代表您同意《服务协议》和《隐私政策》</text>
      </view>
    </view>

    <view class="footer-tip">
      <text>忘记密码？请联系机构管理员重置</text>
    </view>
  </view>
</template>

<script>
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import { initPush } from '@/utils/push'
import { isValidMobile } from '@/utils/format'

export default {
  data() {
    return {
      form: { mobile: '', password: '' },
      submitting: false,
      showPwd: false
    }
  },
  onLoad() {
    // 已登录则直接跳到首页
    const auth = useAuthStore()
    if (auth.isAuthenticated) {
      uni.reLaunch({ url: '/pages/tabbar/home' })
    }
  },
  methods: {
    async handleLogin() {
      if (!isValidMobile(this.form.mobile)) {
        return uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
      }
      if (!this.form.password || this.form.password.length < 6) {
        return uni.showToast({ title: '密码至少 6 位', icon: 'none' })
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
        // 初始化推送（登录后才能拿到稳定的 clientId）
        try { initPush() } catch (_) {}
        uni.showToast({ title: '登录成功', icon: 'success' })
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
  padding: 80rpx 48rpx 0;
  background: linear-gradient(180deg, #eef4ff 0%, #f7f8fa 50%);
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
.btn-primary {
  margin-top: 48rpx;
  width: 100%;
}
.tips {
  margin-top: 24rpx;
  text-align: center;
  font-size: 22rpx;
  color: #9ca3af;
}
.footer-tip {
  margin-top: 48rpx;
  text-align: center;
  font-size: 24rpx;
  color: #9ca3af;
}
</style>
