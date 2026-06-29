<!--
  登录页 - 暖橙主题 + 情感化设计
  - 手机号 + 密码
  - 触发滑块验证
  - 协议勾选
  - 登录后跳首页 (有 requirePasswordChange 跳改密页)
-->
<template>
  <view class="login">
    <!-- 顶部装饰 -->
    <view class="login__bg">
      <view class="login__circle login__circle--1" />
      <view class="login__circle login__circle--2" />
      <view class="login__circle login__circle--3" />
    </view>

    <view class="login__inner">
      <view class="login__brand">
        <view class="login__logo anim-bounce">
          <text class="login__logo-emoji">🎒</text>
        </view>
        <text class="login__title">EduStation</text>
        <text class="login__subtitle">让孩子爱上学习的地方</text>
      </view>

      <view class="login__card">
        <!-- 手机号 -->
        <view class="login__field">
          <text class="login__field-icon">📱</text>
          <input
            v-model="form.mobile"
            class="login__field-input"
            type="number"
            maxlength="11"
            placeholder="请输入手机号"
            placeholder-class="login__field-placeholder"
          />
        </view>

        <view class="login__field-divider" />

        <!-- 密码 -->
        <view class="login__field">
          <text class="login__field-icon">🔒</text>
          <input
            v-model="form.password"
            class="login__field-input"
            :password="!showPassword"
            placeholder="请输入密码"
            placeholder-class="login__field-placeholder"
          />
          <view class="login__field-extra" @tap="showPassword = !showPassword">
            <text>{{ showPassword ? '🙈' : '👁' }}</text>
          </view>
        </view>

        <!-- 协议勾选 -->
        <view class="login__agree">
          <view class="login__agree-check press" @tap="agreed = !agreed">
            <view
              class="login__agree-box"
              :class="{ 'login__agree-box--checked': agreed }"
            >
              <text v-if="agreed" class="login__agree-check-icon">✓</text>
            </view>
          </view>
          <text class="login__agree-text">
            我已阅读并同意
            <text class="login__agree-link" @tap.stop="openLegal('user-agreement')">《用户协议》</text>
            和
            <text class="login__agree-link" @tap.stop="openLegal('privacy-policy')">《隐私政策》</text>
          </text>
        </view>

        <!-- 登录按钮 -->
        <view
          class="login__btn"
          :class="{
            'login__btn--disabled': !canSubmit || submitting,
            'login__btn--shake': errorShake
          }"
          @tap="onSubmit"
        >
          <view v-if="submitting" class="login__btn-spinner" />
          <text class="login__btn-text">{{ submitting ? '登录中...' : '登 录' }}</text>
        </view>

        <!-- 提示 -->
        <view class="login__hint">
          <text>登录遇到问题?请联系机构老师</text>
        </view>
      </view>

      <view class="login__footer">
        <text class="login__footer-text">
          首次登录? 初始密码是手机号后 6 位
        </text>
      </view>
    </view>

    <!-- 滑块弹层 -->
    <slider-captcha
      v-if="showCaptcha"
      @success="onCaptchaSuccess"
      @close="showCaptcha = false"
    />

    <!-- 协议弹层 -->
    <agreement-modal
      v-if="legalVisible"
      :visible="legalVisible"
      :title="legalTitle"
      :content="legalContent"
      @confirm="legalVisible = false"
      @cancel="legalVisible = false"
    />
  </view>
</template>

<script>
import { useAuthStore } from '@/stores/auth'
import { useStudentStore } from '@/stores/student'
import { legalApi } from '@/api/legal'
import SliderCaptcha from '@/components/auth/SliderCaptcha.vue'
import AgreementModal from '@/components/auth/AgreementModal.vue'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'
import { isValidPhone } from '@/utils/format'

export default {
  components: { SliderCaptcha, AgreementModal },
  data() {
    return {
      form: { mobile: '', password: '' },
      showPassword: false,
      agreed: false,
      submitting: false,
      showCaptcha: false,
      captchaPass: '',
      errorShake: false,
      legalVisible: false,
      legalTitle: '',
      legalContent: '',
      // 失败计数, 决定是否弹滑块
      failCount: 0
    }
  },
  computed: {
    canSubmit() {
      return isValidPhone(this.form.mobile) && this.form.password.length >= 6 && this.agreed
    }
  },
  onShow() {
    // 自动聚焦 (H5 用)
  },
  methods: {
    async onSubmit() {
      if (!this.canSubmit) {
        if (!this.agreed) {
          toast.warn('请先勾选同意协议')
        } else if (!isValidPhone(this.form.mobile)) {
          toast.warn('请输入正确的手机号')
        } else if (this.form.password.length < 6) {
          toast.warn('密码至少 6 位')
        }
        haptic.warn()
        this._shake()
        return
      }

      // 失败 2 次以上先弹滑块
      if (this.failCount >= 2 && !this.captchaPass) {
        this.showCaptcha = true
        return
      }

      this.submitting = true
      try {
        const auth = useAuthStore()
        await auth.login({
          mobile: this.form.mobile,
          password: this.form.password,
          captchaPass: this.captchaPass || undefined
        })

        // 拉孩子
        const student = useStudentStore()
        try {
          await student.fetchMyStudents()
        } catch (_) {}

        // requirePasswordChange 跳改密
        if (auth.requirePasswordChange) {
          haptic.warn()
          toast.warn('首次登录,请修改初始密码')
          setTimeout(() => {
            uni.reLaunch({ url: '/pages/auth/reset-password?force=1' })
          }, 600)
          return
        }

        haptic.success()
        toast.success('欢迎回来!')
        setTimeout(() => {
          uni.reLaunch({ url: '/pages/tabbar/home' })
        }, 400)
      } catch (e) {
        this.failCount++
        this.captchaPass = ''
        haptic.error()
        this._shake()
        // captcha_required 自动弹滑块
        if (e.code === 'captcha_required' || e.data?.reason === 'captcha_required') {
          this.showCaptcha = true
        } else {
          toast.error(e.message || '登录失败')
        }
      } finally {
        this.submitting = false
      }
    },

    onCaptchaSuccess(pass) {
      this.captchaPass = pass
      this.showCaptcha = false
      haptic.success()
      setTimeout(() => this.onSubmit(), 200)
    },

    async openLegal(key) {
      this.legalTitle = key === 'user-agreement' ? '用户协议' : '隐私政策'
      this.legalVisible = true
      this.legalContent = ''
      try {
        const res = await legalApi.platformDoc(key)
        this.legalContent = res.content || res.html || res.text || ''
      } catch (e) {
        this.legalContent = '加载失败,请稍后再试'
      }
    },

    _shake() {
      this.errorShake = true
      setTimeout(() => (this.errorShake = false), 500)
    }
  }
}
</script>

<style lang="scss" scoped>
.login {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFE4D3 0%, $bg-page 60%);
  position: relative;
  overflow: hidden;

  &__bg {
    position: absolute;
    inset: 0;
    overflow: hidden;
    pointer-events: none;
  }

  &__circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.5;
    animation: float 6s ease-in-out infinite;

    &--1 {
      width: 320rpx;
      height: 320rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: -80rpx;
      right: -80rpx;
      animation-delay: 0s;
    }
    &--2 {
      width: 240rpx;
      height: 240rpx;
      background: radial-gradient(circle, #FFD0B8 0%, transparent 70%);
      top: 200rpx;
      left: -60rpx;
      animation-delay: 1s;
    }
    &--3 {
      width: 200rpx;
      height: 200rpx;
      background: radial-gradient(circle, $accent-light 0%, transparent 70%);
      bottom: 100rpx;
      right: 40rpx;
      animation-delay: 2s;
    }
  }

  &__inner {
    position: relative;
    padding: 96rpx $spacing-lg $spacing-xl;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  &__brand {
    text-align: center;
    margin-bottom: $spacing-2xl;
    padding-top: $spacing-2xl;
  }

  &__logo {
    width: 144rpx;
    height: 144rpx;
    margin: 0 auto $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    border-radius: 36rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16rpx 40rpx rgba(255, 138, 101, 0.4);
    transform: rotate(-6deg);
  }

  &__logo-emoji {
    font-size: 80rpx;
    line-height: 1;
    transform: rotate(6deg);
  }

  &__title {
    display: block;
    font-size: $font-3xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
    letter-spacing: 4rpx;
    @include text-gradient($primary, $primary-light);
  }

  &__subtitle {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    letter-spacing: 2rpx;
  }

  &__card {
    background: $bg-card;
    border-radius: $radius-lg;
    padding: $spacing-lg $spacing-md;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.12);
  }

  &__field {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-xs;
  }

  &__field-divider {
    height: 1rpx;
    background: $divider-light;
    margin: 0 $spacing-xs;
  }

  &__field-icon {
    font-size: 36rpx;
    margin-right: $spacing-sm;
  }

  &__field-input {
    flex: 1;
    font-size: $font-base;
    color: $text-primary;
    height: 56rpx;
  }

  &__field-placeholder {
    color: $text-tertiary;
  }

  &__field-extra {
    padding: $spacing-xs;
  }

  &__agree {
    display: flex;
    align-items: flex-start;
    margin-top: $spacing-md;
  }

  &__agree-check {
    padding: 4rpx;
    margin-right: $spacing-xs;
  }

  &__agree-box {
    width: 32rpx;
    height: 32rpx;
    border: 2rpx solid $text-tertiary;
    border-radius: $radius-xs;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all $transition-fast;

    &--checked {
      background: $primary;
      border-color: $primary;
    }
  }

  &__agree-check-icon {
    color: #fff;
    font-size: 24rpx;
    font-weight: bold;
  }

  &__agree-text {
    flex: 1;
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.5;
  }

  &__agree-link {
    color: $primary;
  }

  &__btn {
    margin-top: $spacing-lg;
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    text-align: center;
    box-shadow: $shadow-button;
    transition: all $transition-fast;
    display: flex;
    align-items: center;
    justify-content: center;

    &:active:not(&--disabled) {
      transform: scale(0.97);
    }

    &--disabled {
      opacity: 0.45;
      filter: grayscale(0.3);
      box-shadow: none;
    }

    &--shake {
      animation: shake 0.4s ease-out;
    }
  }

  &__btn-text {
    color: #fff;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    letter-spacing: 8rpx;
  }

  &__btn-spinner {
    width: 32rpx;
    height: 32rpx;
    border: 4rpx solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-right: 12rpx;
  }

  &__hint {
    text-align: center;
    margin-top: $spacing-md;
  }

  &__hint > text {
    font-size: $font-xs;
    color: $text-tertiary;
  }

  &__footer {
    text-align: center;
    margin-top: auto;
    padding-top: $spacing-2xl;
  }

  &__footer-text {
    font-size: $font-xs;
    color: $text-tertiary;
  }
}
</style>