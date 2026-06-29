<!--
  改密页 (R-0105)
  - 首次登录强制改密 (?force=1)
  - 原密码 + 新密码 + 确认密码
-->
<template>
  <view class="reset-pwd">
    <view class="reset-pwd__bg">
      <view class="reset-pwd__circle reset-pwd__circle--1" />
      <view class="reset-pwd__circle reset-pwd__circle--2" />
    </view>

    <view class="reset-pwd__inner">
      <view class="reset-pwd__header">
        <view class="reset-pwd__icon">
          <text>🔐</text>
        </view>
        <text class="reset-pwd__title">{{ isForce ? '欢迎,请设置新密码' : '修改密码' }}</text>
        <text class="reset-pwd__sub">
          {{ isForce ? '为了您的账户安全,请修改初始密码' : '修改后,其他设备将自动登出' }}
        </text>
      </view>

      <view class="reset-pwd__card">
        <view class="reset-pwd__field">
          <text class="reset-pwd__field-icon">🔒</text>
          <input
            v-model="form.oldPassword"
            class="reset-pwd__field-input"
            :password="!showOld"
            placeholder="原密码"
            placeholder-class="reset-pwd__placeholder"
          />
          <view class="reset-pwd__field-extra" @tap="showOld = !showOld">
            <text>{{ showOld ? '🙈' : '👁' }}</text>
          </view>
        </view>

        <view class="reset-pwd__divider" />

        <view class="reset-pwd__field">
          <text class="reset-pwd__field-icon">🆕</text>
          <input
            v-model="form.newPassword"
            class="reset-pwd__field-input"
            :password="!showNew"
            placeholder="新密码 (6-64 位)"
            placeholder-class="reset-pwd__placeholder"
          />
          <view class="reset-pwd__field-extra" @tap="showNew = !showNew">
            <text>{{ showNew ? '🙈' : '👁' }}</text>
          </view>
        </view>

        <!-- 强度条 -->
        <view v-if="form.newPassword" class="reset-pwd__strength">
          <view class="reset-pwd__strength-bar">
            <view
              class="reset-pwd__strength-fill"
              :class="strengthClass"
              :style="{ width: strengthPercent + '%' }"
            />
          </view>
          <text class="reset-pwd__strength-label">{{ strengthLabel }}</text>
        </view>

        <view class="reset-pwd__divider" />

        <view class="reset-pwd__field">
          <text class="reset-pwd__field-icon">✅</text>
          <input
            v-model="form.confirm"
            class="reset-pwd__field-input"
            :password="!showConfirm"
            placeholder="再次输入新密码"
            placeholder-class="reset-pwd__placeholder"
          />
          <view class="reset-pwd__field-extra" @tap="showConfirm = !showConfirm">
            <text>{{ showConfirm ? '🙈' : '👁' }}</text>
          </view>
        </view>
      </view>

      <view
        class="reset-pwd__btn"
        :class="{ 'reset-pwd__btn--disabled': !canSubmit || submitting }"
        @tap="onSubmit"
      >
        <view v-if="submitting" class="reset-pwd__btn-spinner" />
        <text class="reset-pwd__btn-text">{{ submitting ? '提交中...' : '确认修改' }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'

export default {
  data() {
    return {
      isForce: false,
      form: { oldPassword: '', newPassword: '', confirm: '' },
      showOld: false,
      showNew: false,
      showConfirm: false,
      submitting: false
    }
  },
  computed: {
    canSubmit() {
      if (this.isForce) {
        return this.form.newPassword.length >= 6 && this.form.newPassword === this.form.confirm
      }
      return (
        this.form.oldPassword.length >= 6 &&
        this.form.newPassword.length >= 6 &&
        this.form.newPassword === this.form.confirm &&
        this.form.newPassword !== this.form.oldPassword
      )
    },
    strength() {
      const p = this.form.newPassword
      if (!p) return 0
      let s = 0
      if (p.length >= 6) s++
      if (p.length >= 10) s++
      if (/[A-Z]/.test(p)) s++
      if (/[0-9]/.test(p)) s++
      if (/[^A-Za-z0-9]/.test(p)) s++
      return Math.min(4, s)
    },
    strengthPercent() {
      return this.strength * 25
    },
    strengthClass() {
      return ['weak', 'weak', 'mid', 'good', 'strong'][this.strength]
    },
    strengthLabel() {
      return ['请输入', '弱', '一般', '良好', '强'][this.strength]
    }
  },
  onLoad(query) {
    this.isForce = query && query.force === '1'
  },
  methods: {
    async onSubmit() {
      if (!this.canSubmit) {
        toast.warn(this._whyInvalid())
        haptic.warn()
        return
      }
      this.submitting = true
      try {
        const auth = useAuthStore()
        const payload = this.isForce
          ? { oldPassword: 'initial', newPassword: this.form.newPassword }
          : { oldPassword: this.form.oldPassword, newPassword: this.form.newPassword }
        await auth.changePassword(payload)
        haptic.success()
        toast.success('密码修改成功')
        // 强制场景: 跳首页; 普通场景: 退栈
        setTimeout(() => {
          if (this.isForce) {
            uni.reLaunch({ url: '/pages/tabbar/home' })
          } else {
            uni.navigateBack()
          }
        }, 800)
      } catch (e) {
        haptic.error()
        toast.error(e.message || '修改失败')
      } finally {
        this.submitting = false
      }
    },
    _whyInvalid() {
      if (this.form.newPassword !== this.form.confirm) return '两次输入的密码不一致'
      if (this.form.newPassword.length < 6) return '密码至少 6 位'
      if (!this.isForce && this.form.oldPassword === this.form.newPassword) return '新密码不能与原密码相同'
      return '请检查输入'
    }
  }
}
</script>

<style lang="scss" scoped>
.reset-pwd {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFE4D3 0%, $bg-page 50%);
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
      width: 280rpx;
      height: 280rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: 40rpx;
      right: -80rpx;
    }
    &--2 {
      width: 220rpx;
      height: 220rpx;
      background: radial-gradient(circle, $accent-light 0%, transparent 70%);
      top: 240rpx;
      left: -60rpx;
      animation-delay: 1.5s;
    }
  }

  &__inner {
    position: relative;
    padding: $spacing-2xl $spacing-lg;
  }

  &__header {
    text-align: center;
    margin-bottom: $spacing-xl;
  }

  &__icon {
    width: 120rpx;
    height: 120rpx;
    margin: 0 auto $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    border-radius: 32rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 64rpx;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.32);
    animation: bounce 2s ease-in-out infinite;
  }

  &__title {
    display: block;
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__sub {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__card {
    background: $bg-card;
    border-radius: $radius-lg;
    padding: $spacing-md;
    box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.10);
  }

  &__field {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-xs;
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

  &__placeholder {
    color: $text-tertiary;
  }

  &__field-extra {
    padding: $spacing-xs;
  }

  &__divider {
    height: 1rpx;
    background: $divider-light;
    margin: 0 $spacing-xs;
  }

  &__strength {
    padding: $spacing-xs $spacing-xs;
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  &__strength-bar {
    flex: 1;
    height: 8rpx;
    background: $divider-light;
    border-radius: 4rpx;
    overflow: hidden;
  }

  &__strength-fill {
    height: 100%;
    border-radius: 4rpx;
    transition: all $transition-base;

    &.weak {
      background: $warning;
    }
    &.mid {
      background: $gold;
    }
    &.good {
      background: $accent;
    }
    &.strong {
      background: linear-gradient(90deg, $accent, $gold);
    }
  }

  &__strength-label {
    font-size: $font-xs;
    color: $text-secondary;
    min-width: 60rpx;
    text-align: right;
  }

  &__btn {
    margin-top: $spacing-xl;
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
}
</style>