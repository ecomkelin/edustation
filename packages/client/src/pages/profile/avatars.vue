<!--
  个人资料 - 头像选择 (C 端家长自助)
  2026-07-05 新增: 不再上传头像, 从 4 个预制 SVG 中选 (妈妈/爸爸/奶奶/爷爷)
  - 复用 @shared/avatars 枚举
  - 提交: 调用 authApi.updateMe({ avatarSvgKey })
-->
<template>
  <view class="avatars-page safe-area-top">
    <view class="avatars-page__header">
      <text class="avatars-page__title">选择头像</text>
      <text class="avatars-page__sub">妈妈 / 爸爸 / 奶奶 /爷爷 中选一个</text>
    </view>

    <view class="avatars-page__grid">
      <view
        v-for="item in items"
        :key="item.key"
        class="avatars-page__item"
        :class="{ 'avatars-page__item--active': item.key === local }"
        @tap="pick(item.key)"
      >
        <SvgAvatar :svg-key="item.key" :size="80" audience="user" />
        <text class="avatars-page__label">{{ item.label }}</text>
      </view>
    </view>

    <view class="avatars-page__footer safe-area-bottom">
      <button class="avatars-page__btn" :disabled="saving" @tap="save">
        {{ saving ? '保存中…' : '保存' }}
      </button>
    </view>
  </view>
</template>

<script>
import avatars from '@shared/avatars'
const { USER_AVATARS } = avatars
import SvgAvatar from '@/components/Avatar/SvgAvatar.vue'
import { authApi } from '@/api/auth'

export default {
  components: { SvgAvatar },
  data() {
    return {
      items: USER_AVATARS,
      local: '',
      saving: false
    }
  },
  onLoad() {
    this.local = this.$store?.state?.auth?.user?.avatarSvgKey || 'mom'
  },
  methods: {
    pick(key) {
      this.local = key
      uni.$emit('haptic-tap')
    },
    async save() {
      if (!this.local) {
        uni.showToast({ title: '请选择头像', icon: 'none' })
        return
      }
      this.saving = true
      try {
        await authApi.updateMe({ avatarSvgKey: this.local })
        uni.showToast({ title: '已保存', icon: 'success' })
        // 触发 me / 各处 store 刷新
        uni.$emit('auth-me-changed')
        setTimeout(() => uni.navigateBack(), 800)
      } catch (e) {
        // 拦截器已 toast
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style scoped>
.avatars-page {
  min-height: 100vh;
  background: #fafbfc;
  padding: 32rpx 24rpx;
}
.avatars-page__header {
  padding: 24rpx 16rpx 32rpx;
}
.avatars-page__title {
  display: block;
  font-size: 36rpx;
  font-weight: 600;
  color: #1a1a1a;
}
.avatars-page__sub {
  display: block;
  margin-top: 8rpx;
  font-size: 26rpx;
  color: #909399;
}
.avatars-page__grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24rpx;
}
.avatars-page__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
  padding: 32rpx 16rpx;
  border: 4rpx solid transparent;
  border-radius: 24rpx;
  background: #fff;
  transition: border-color 0.15s ease;
}
.avatars-page__item--active {
  border-color: #5a7a6a;
  background: #e8f4ee;
}
.avatars-page__label {
  font-size: 28rpx;
  color: #606266;
}
.avatars-page__item--active .avatars-page__label {
  color: #5a7a6a;
  font-weight: 600;
}
.avatars-page__footer {
  margin-top: 48rpx;
  padding: 0 16rpx;
}
.avatars-page__btn {
  height: 88rpx;
  background: #5a7a6a;
  color: #fff;
  border-radius: 12rpx;
  font-size: 30rpx;
  font-weight: 500;
  border: none;
}
.avatars-page__btn:disabled {
  background: #c8ccc8;
}
</style>
