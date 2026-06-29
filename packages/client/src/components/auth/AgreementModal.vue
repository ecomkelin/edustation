<!--
  AgreementModal - 单份协议签署弹窗
  - 显示协议 markdown 渲染
  - 用户勾选同意 + 签名 (v1:勾选即视为同意,签名可在 console 留)
-->
<template>
  <view class="agreement-modal" v-if="visible">
    <view class="agreement-modal__mask" @click="onCancel" />
    <view class="agreement-modal__content anim-fade-in-up">
      <view class="agreement-modal__header">
        <text class="agreement-modal__title">{{ title || '用户协议' }}</text>
        <text class="agreement-modal__close" @click="onCancel">×</text>
      </view>

      <scroll-view scroll-y class="agreement-modal__body">
        <view class="agreement-modal__html" v-html="renderedHtml" />
      </scroll-view>

      <view class="agreement-modal__footer">
        <!-- H5 下 @tap 偶尔失效 (尤其 PC Chrome), 改用原生 @click + 阻止冒泡 -->
        <label class="agreement-modal__checkbox" @click.stop.prevent="toggleAgree">
          <view
            class="agreement-modal__check"
            :class="{ 'agreement-modal__check--checked': agreed }"
            @click.stop.prevent="toggleAgree"
          >
            <text v-if="agreed" class="agreement-modal__check-icon">✓</text>
          </view>
          <text
            class="agreement-modal__check-text"
            @click.stop.prevent="toggleAgree"
          >我已阅读并同意《{{ title || '用户协议' }}》</text>
        </label>

        <view class="agreement-modal__buttons">
          <view class="agreement-modal__btn agreement-modal__btn--ghost press" @click="onCancel">
            <text>暂不同意</text>
          </view>
          <view
            class="agreement-modal__btn agreement-modal__btn--primary press"
            :class="{ 'agreement-modal__btn--disabled': !agreed }"
            @click="onConfirm"
          >
            <text>同意并继续</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { haptic } from '@/utils/haptic'

export default {
  name: 'AgreementModal',
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: '用户协议' },
    content: { type: String, default: '' }, // markdown
    version: { type: String, default: '' }
  },
  emits: ['confirm', 'cancel'],
  data() {
    return { agreed: false }
  },
  computed: {
    renderedHtml() {
      // 简易 markdown -> html 渲染 (粗体/列表/换行)
      if (!this.content) {
        // 后端没接协议正文 → 展示默认占位, 让用户不感觉"空"
        return [
          '<div class="agreement-placeholder">',
          '  <div class="agreement-placeholder__emoji">📄</div>',
          '  <h3>欢迎使用 EduStation</h3>',
          '  <p>请您仔细阅读以下条款, 勾选"我已阅读并同意"后即可继续:</p>',
          '  <ul>',
          '    <li>您承诺所提交的注册信息真实、有效,并妥善保管账户密码</li>',
          '    <li>您同意 EduStation 按照隐私政策收集、使用您的个人信息</li>',
          '    <li>您理解课程报名/退款/课包使用须遵守机构的具体规则</li>',
          '    <li>您同意 EduStation 通过短信/App 推送向您发送课程提醒</li>',
          '    <li>本协议具体条款以平台最终公示版本为准</li>',
          '  </ul>',
          '  <p class="agreement-placeholder__tip">如需查阅完整协议文本, 请联系客服</p>',
          '</div>'
        ].join('\n')
      }
      const lines = this.content.split('\n')
      let html = ''
      let inList = false
      for (const line of lines) {
        const t = line.trim()
        if (!t) {
          if (inList) {
            html += '</ul>'
            inList = false
          }
          html += '<br/>'
          continue
        }
        if (t.startsWith('# ')) {
          if (inList) {
            html += '</ul>'
            inList = false
          }
          html += `<h2>${this._escape(t.slice(2))}</h2>`
        } else if (t.startsWith('## ')) {
          if (inList) {
            html += '</ul>'
            inList = false
          }
          html += `<h3>${this._escape(t.slice(3))}</h3>`
        } else if (t.match(/^[-*] /)) {
          if (!inList) {
            html += '<ul>'
            inList = true
          }
          html += `<li>${this._inline(t.slice(2))}</li>`
        } else {
          if (inList) {
            html += '</ul>'
            inList = false
          }
          html += `<p>${this._inline(t)}</p>`
        }
      }
      if (inList) html += '</ul>'
      return html
    }
  },
  methods: {
    _escape(s) {
      return String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]))
    },
    _inline(s) {
      let r = this._escape(s)
      r = r.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      r = r.replace(/_(.+?)_/g, '<em>$1</em>')
      return r
    },
    toggleAgree() {
      haptic.tap()
      this.agreed = !this.agreed
    },
    onCancel() {
      this.agreed = false
      this.$emit('cancel')
    },
    onConfirm() {
      if (!this.agreed) {
        haptic.warn()
        return
      }
      haptic.success()
      this.$emit('confirm', this.version)
    }
  }
}
</script>

<style lang="scss" scoped>
.agreement-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: $z-modal;

  &__mask {
    position: absolute;
    inset: 0;
    background: $bg-mask;
    backdrop-filter: blur(4rpx);
  }

  &__content {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: $bg-card;
    border-radius: $radius-lg $radius-lg 0 0;
    height: 80vh;
    display: flex;
    flex-direction: column;
    padding-bottom: env(safe-area-inset-bottom, 0);
  }

  &__header {
    @include flex-between;
    padding: $spacing-md;
    border-bottom: 1rpx solid $divider-light;
  }

  &__title {
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
    color: $text-primary;
  }

  &__close {
    font-size: 40rpx;
    color: $text-tertiary;
    line-height: 1;
    padding: 0 12rpx;
  }

  &__body {
    flex: 1;
    padding: $spacing-md;
  }

  &__html {
    color: $text-primary;
    font-size: $font-base;
    line-height: 1.7;

    :deep(h2) {
      font-size: $font-xl;
      font-weight: $font-weight-semibold;
      margin: $spacing-md 0 $spacing-sm;
      color: $primary;
    }
    :deep(h3) {
      font-size: $font-md;
      font-weight: $font-weight-semibold;
      margin: $spacing-sm 0;
    }
    :deep(p) {
      margin: $spacing-xs 0;
    }
    :deep(ul) {
      padding-left: $spacing-md;
      margin: $spacing-xs 0;
    }
    :deep(li) {
      margin: $spacing-xs 0;
      list-style: disc;
    }
    :deep(strong) {
      color: $primary;
      font-weight: $font-weight-semibold;
    }
  }

  // v-html 注入的占位协议 HTML (不带 scoped attribute,需 :deep 穿透)
  // 注意: :deep() 不能嵌套, 每个子选择器都要单独写
  &__html :deep(.agreement-placeholder) {
    text-align: center;
    padding: $spacing-lg $spacing-sm;
  }
  &__html :deep(.agreement-placeholder__emoji) {
    font-size: 80rpx;
    margin-bottom: $spacing-md;
  }
  &__html :deep(.agreement-placeholder h3) {
    font-size: $font-xl;
    color: $primary;
    margin: 0 0 $spacing-md;
  }
  &__html :deep(.agreement-placeholder p) {
    text-align: left;
    color: $text-secondary;
    line-height: 1.7;
    margin: $spacing-sm 0;
  }
  &__html :deep(.agreement-placeholder ul) {
    text-align: left;
    color: $text-primary;
    line-height: 1.9;
    padding-left: $spacing-md;
    margin: $spacing-md 0;
  }
  &__html :deep(.agreement-placeholder li) {
    margin: $spacing-xs 0;
  }
  &__html :deep(.agreement-placeholder__tip) {
    margin-top: $spacing-lg;
    padding-top: $spacing-md;
    border-top: 1rpx dashed $divider;
    color: $text-tertiary;
    font-size: $font-sm;
    text-align: center;
  }

  &__footer {
    padding: $spacing-md;
    border-top: 1rpx solid $divider-light;
  }

  &__checkbox {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-xs;
    margin: 0 (-$spacing-xs);  // 抵消 padding, 视觉对齐
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
  }

  &__check {
    flex-shrink: 0;
    width: 40rpx;
    height: 40rpx;
    min-width: 40rpx;  // H5 下 width 失效时兜底
    min-height: 40rpx;
    border: 2rpx solid $text-tertiary;
    border-radius: $radius-xs;
    margin-right: $spacing-sm;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all $transition-fast;
    box-sizing: border-box;

    &--checked {
      background: $primary;
      border-color: $primary;
    }
  }

  &__check-icon {
    color: #fff;
    font-size: $font-sm;
    font-weight: bold;
  }

  &__check-text {
    font-size: $font-sm;
    color: $text-primary;
  }

  &__buttons {
    display: flex;
    gap: $spacing-sm;
    margin-top: $spacing-md;
  }

  &__btn {
    flex: 1;
    padding: $spacing-sm $spacing-md;
    border-radius: $radius-pill;
    text-align: center;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    transition: all $transition-fast;

    &--ghost {
      background: $bg-page;
      color: $text-secondary;
      border: 2rpx solid $divider;
    }

    &--primary {
      background: linear-gradient(135deg, $primary, $primary-light);
      color: #fff;
      box-shadow: $shadow-button;
    }

    &--disabled {
      opacity: 0.45;
      pointer-events: none;
    }
  }
}
</style>