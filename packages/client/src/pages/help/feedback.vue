<!--
  意见反馈 - 占位 (后续接入后台收集)
-->
<template>
  <view class="feedback">
    <view class="feedback__hero">
      <view class="feedback__hero-art">
        <text>💬</text>
      </view>
      <text class="feedback__hero-title">说点什么吧</text>
      <text class="feedback__hero-sub">您的反馈会让我们做得更好</text>
    </view>

    <view class="feedback__form">
      <view class="feedback__field">
        <text class="feedback__field-label">意见类型</text>
        <view class="feedback__tags">
          <view
            v-for="t in types"
            :key="t"
            class="feedback__tag"
            :class="{ 'feedback__tag--active': form.type === t }"
            @tap="form.type = t"
          >
            <text>{{ t }}</text>
          </view>
        </view>
      </view>

      <view class="feedback__field">
        <text class="feedback__field-label">详细描述</text>
        <textarea
          v-model="form.content"
          class="feedback__textarea"
          placeholder="请告诉我们您想反馈的问题或建议..."
          maxlength="500"
        />
        <text class="feedback__count">{{ form.content.length }} / 500</text>
      </view>

      <view class="feedback__field">
        <text class="feedback__field-label">联系方式 (可选)</text>
        <input
          v-model="form.contact"
          class="feedback__input"
          placeholder="手机号或微信号"
        />
      </view>

      <view class="feedback__submit press" @tap="onSubmit">
        <text>提交反馈</text>
      </view>
    </view>
  </view>
</template>

<script>
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'

export default {
  data() {
    return {
      types: ['功能建议', '体验问题', '内容错误', '其他'],
      form: {
        type: '功能建议',
        content: '',
        contact: ''
      }
    }
  },
  methods: {
    onSubmit() {
      if (!this.form.content.trim()) {
        toast.warn('请填写反馈内容')
        haptic.warn()
        return
      }
      // TODO: 接 /api/v1/feedback (后端暂无该端点, 先存本地或发邮件)
      haptic.success()
      toast.success('感谢您的反馈,我们会尽快查看')
      setTimeout(() => uni.navigateBack(), 800)
    }
  }
}
</script>

<style lang="scss" scoped>
.feedback {
  min-height: 100vh;
  background: $bg-page;
  padding: $spacing-md;

  &__hero {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl 0;
    background: linear-gradient(180deg, #FFE4D3 0%, $bg-page 100%);
    border-radius: $radius-md;
    margin-bottom: $spacing-md;
  }

  &__hero-art {
    width: 160rpx;
    height: 160rpx;
    background: linear-gradient(135deg, $primary, $primary-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 80rpx;
    margin-bottom: $spacing-md;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.32);
  }

  &__hero-title {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__hero-sub {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__form {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
  }

  &__field {
    margin-bottom: $spacing-lg;
  }

  &__field-label {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }

  &__tags {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  &__tag {
    padding: 12rpx 24rpx;
    background: $bg-page;
    border: 2rpx solid $divider;
    border-radius: $radius-pill;
    font-size: $font-sm;
    color: $text-secondary;

    &--active {
      background: $primary-lighter;
      border-color: $primary;
      color: $primary-dark;
    }

    & > text {
      font-size: inherit;
      color: inherit;
    }
  }

  &__textarea {
    width: 100%;
    min-height: 200rpx;
    padding: $spacing-sm;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: $font-base;
    color: $text-primary;
    box-sizing: border-box;
  }

  &__count {
    display: block;
    text-align: right;
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: 4rpx;
  }

  &__input {
    width: 100%;
    padding: $spacing-sm;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: $font-base;
    color: $text-primary;
    box-sizing: border-box;
  }

  &__submit {
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    text-align: center;
    box-shadow: $shadow-button;

    & > text {
      color: #fff;
      font-size: $font-base;
      font-weight: $font-weight-semibold;
    }
  }
}
</style>