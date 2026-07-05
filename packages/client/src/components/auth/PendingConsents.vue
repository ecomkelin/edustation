<!--
  PendingConsents - 待签协议墙 (2026-07-05 升级)
  - 旧版: 每条点 "查看 ›" 弹 sub-modal (AgreementModal) → 用户点同意 → 关闭 → 回到列表
           N 份协议就要 N 次弹窗 + N 次交互, 体验繁琐
  - 新版: row 内 inline 展开 (点 row 头部 toggle) + 行尾 checkbox + 行内「我已阅读并同意」按钮
           看完内容直接勾选, 全部勾完底部按钮一次性 continue
-->
<template>
  <view class="pending-consents" v-if="visible">
    <view class="pending-consents__mask" />
    <view class="pending-consents__content anim-fade-in-up">
      <view class="pending-consents__header">
        <view class="pending-consents__art">
          <text class="pending-consents__emoji">📜</text>
        </view>
        <text class="pending-consents__title">开始之前,先看几个条款</text>
        <text class="pending-consents__desc">
          我们准备了 {{ list.length }} 份协议,看完后勾选即可继续使用
        </text>
      </view>

      <scroll-view scroll-y class="pending-consents__list">
        <view
          v-for="(item, i) in list"
          :key="item.key || i"
          class="pending-consents__item"
          :class="{ 'pending-consents__item--expanded': expanded[item.key], 'pending-consents__item--signed': signed[item.key] }"
        >
          <!-- row 头部: icon + 标题 + meta + checkbox -->
          <view class="pending-consents__item-row press" @tap="onToggleExpand(item)">
            <view class="pending-consents__item-icon">
              <text>{{ iconOf(item) }}</text>
            </view>
            <view class="pending-consents__item-info">
              <text class="pending-consents__item-name">{{ item.title || item.key }}</text>
              <text class="pending-consents__item-meta">{{ metaOf(item) }}</text>
            </view>
            <view
              class="pending-consents__item-check press"
              :class="{ 'pending-consents__item-check--on': !!signed[item.key] }"
              @tap.stop="onToggleAgree(item)"
            >
              <text v-if="signed[item.key]" class="pending-consents__item-check-icon">✓</text>
            </view>
          </view>

          <!-- row 展开: scroll-view 内嵌 markdown 渲染 + inline 同意按钮 -->
          <view v-if="expanded[item.key]" class="pending-consents__item-body">
            <scroll-view scroll-y class="pending-consents__item-content">
              <view v-if="contents[item.key]" class="pending-consents__item-content-html" v-html="contents[item.key]" />
              <view v-else class="pending-consents__item-loading">
                <text>加载中…</text>
              </view>
            </scroll-view>

            <view
              class="pending-consents__item-agree press"
              :class="{ 'pending-consents__item-agree--on': !!signed[item.key] }"
              @tap="onToggleAgree(item)"
            >
              <view class="pending-consents__item-agree-icon">
                <text v-if="signed[item.key]">✓</text>
              </view>
              <text class="pending-consents__item-agree-text">我已阅读并同意</text>
            </view>
          </view>
        </view>
      </scroll-view>

      <view class="pending-consents__footer">
        <view
          class="pending-consents__btn press"
          :class="{ 'pending-consents__btn--disabled': !canContinue }"
          @tap="onContinue"
        >
          <text class="pending-consents__btn-text">
            {{ canContinue ? `继续使用 (${signedCount}/${list.length})` : `请先勾选 (${signedCount}/${list.length})` }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { legalApi } from '@/api/legal'
import { renderAgreement } from '@/utils/agreementRender'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'

export default {
  name: 'PendingConsents',
  props: {
    visible: { type: Boolean, default: false },
    list: { type: Array, default: () => [] }
  },
  emits: ['done', 'close'],
  data() {
    return {
      // key -> version 已签署记录
      signed: {},
      // key -> bool 是否展开内容
      expanded: {},
      // key -> html 缓存的协议正文 (renderAgreement 输出)
      contents: {}
    }
  },
  computed: {
    signedCount() {
      return Object.keys(this.signed).length
    },
    canContinue() {
      return this.signedCount >= this.list.length && this.list.length > 0
    }
  },
  methods: {
    iconOf(item) {
      const k = (item.key || '').toLowerCase()
      if (k.includes('privacy')) return '🔒'
      if (k.includes('user') || k.includes('service')) return '🤝'
      if (k.includes('face') || k.includes('biometric')) return '👤'
      if (k.includes('minor') || k.includes('child')) return '🧒'
      return '📄'
    },
    metaOf(item) {
      const parts = []
      if (item.type) parts.push(item.type === 'platform' ? '平台协议' : '机构协议')
      if (item.version) parts.push('v' + item.version)
      if (item.effectiveAt) parts.push('生效于 ' + (item.effectiveAt || '').slice(0, 10))
      return parts.join(' · ')
    },

    /** 点 row 头部: toggle 展开; 首次展开时拉 markdown */
    onToggleExpand(item) {
      const key = item.key
      if (!key) return
      haptic.tap()
      const isExpanded = !this.expanded[key]
      this.expanded = { ...this.expanded, [key]: isExpanded }
      if (isExpanded && !this.contents[key]) {
        this._fetchContent(item)
      }
    },

    /** 点行尾 checkbox 或 行内「我已阅读并同意」: 勾选即调用 legalApi.sign */
    async onToggleAgree(item) {
      const key = item.key
      if (!key) return
      // 已签过的, 法律上视为签了, 不允许取消 (避免误操作)
      if (this.signed[key]) return
      haptic.tap()
      try {
        await legalApi.sign({
          key,
          version: item.version,
          type: item.type || 'platform',
          orgId: item.org || null
        })
        this.signed = { ...this.signed, [key]: item.version }
        // 全部勾完: 收紧卡片 → 自动 toast 提示可继续
        if (this.canContinue) {
          haptic.success()
          toast.success('已全部勾选,可继续使用')
        }
      } catch (e) {
        toast.error((e && e.message) || '签署失败,请重试')
        haptic.error()
      }
    },

    async _fetchContent(item) {
      try {
        const res = await this._fetchRaw(item)
        // 后端可能直接返 HTML 占位 / markdown text; renderAgreement 自适应
        this.contents = { ...this.contents, [item.key]: renderAgreement(res.content || res.html || res.text || '') }
      } catch (e) {
        // 失败也走 renderAgreement 默认 placeholder
        this.contents = { ...this.contents, [item.key]: renderAgreement('') }
      }
    },

    async _fetchRaw(item) {
      if (item.type === 'org' && item.org) {
        return legalApi.orgDoc(item.org, item.key)
      }
      return legalApi.platformDoc(item.key)
    },

    onContinue() {
      if (!this.canContinue) {
        haptic.warn()
        return
      }
      haptic.success()
      this.$emit('done')
    }
  }
}
</script>

<style lang="scss" scoped>
.pending-consents {
  position: fixed;
  inset: 0;
  z-index: $z-modal;
  display: flex;
  align-items: center;
  justify-content: center;

  &__mask {
    position: absolute;
    inset: 0;
    background: $bg-mask;
    backdrop-filter: blur(8rpx);
  }

  &__content {
    position: relative;
    width: 90%;
    max-width: 600rpx;
    max-height: 80vh;
    background: $bg-card;
    border-radius: $radius-lg;
    box-shadow: 0 16rpx 48rpx rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  &__header {
    padding: $spacing-lg $spacing-md $spacing-md;
    text-align: center;
    background: linear-gradient(180deg, $primary-bg, $bg-card);
    flex-shrink: 0;
  }

  &__art {
    width: 120rpx;
    height: 120rpx;
    margin: 0 auto $spacing-sm;
    background: linear-gradient(135deg, $primary-light, $primary);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.32);
    animation: bounce 2s ease-in-out infinite;
  }

  &__emoji {
    font-size: 64rpx;
  }

  &__title {
    display: block;
    font-size: $font-xl;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__desc {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__list {
    flex: 1;
    padding: $spacing-sm $spacing-md;
  }

  &__item {
    background: $bg-page;
    border-radius: $radius-md;
    margin-bottom: $spacing-sm;
    overflow: hidden;
    transition: background $transition-fast;
    &--signed {
      background: rgba(124, 217, 183, 0.12); // accent-light 主色成功底
    }
  }

  &__item-row {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    transition: background $transition-fast;
    &:active {
      background: $divider-light;
    }
  }

  &__item-icon {
    width: 64rpx;
    height: 64rpx;
    border-radius: $radius-sm;
    background: linear-gradient(135deg, $primary-light, $primary);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: $spacing-sm;
    font-size: 36rpx;
    flex-shrink: 0;
  }

  &__item-info {
    flex: 1;
    min-width: 0;
  }

  &__item-name {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.3;
    @include multi-ellipsis(1);
  }

  &__item-meta {
    display: block;
    font-size: $font-xs;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__item-check {
    flex-shrink: 0;
    width: 48rpx;
    height: 48rpx;
    border-radius: 50%;
    border: 2rpx solid $divider;
    background: $bg-card;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all $transition-base;
    &--on {
      background: $primary;
      border-color: $primary;
    }
  }
  &__item-check-icon {
    color: #fff;
    font-size: 30rpx;
    font-weight: $font-weight-bold;
  }

  &__item-body {
    border-top: 1rpx solid $divider-light;
    padding: $spacing-sm $spacing-md $spacing-md;
    animation: fadeInDown 0.2s ease-out;
  }

  &__item-content {
    max-height: 280rpx;
    background: $bg-card;
    border-radius: $radius-sm;
    padding: $spacing-sm $spacing-md;
    margin-bottom: $spacing-sm;
  }

  &__item-content-html {
    font-size: $font-sm;
    color: $text-primary;
    line-height: 1.6;
  }
  // markdown 渲染后内嵌 HTML 样式 (deep 因为来自 v-html, 解析非 scoped)
  &__item-content-html :deep(h2) {
    font-size: $font-md;
    font-weight: $font-weight-bold;
    margin: $spacing-sm 0 $spacing-xs;
  }
  &__item-content-html :deep(h3) {
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    margin: $spacing-xs 0;
  }
  &__item-content-html :deep(p) {
    margin: $spacing-xs 0;
  }
  &__item-content-html :deep(ul) {
    padding-left: $spacing-md;
    margin: $spacing-xs 0;
  }
  &__item-content-html :deep(li) {
    margin: 4rpx 0;
  }
  &__item-content-html :deep(strong) {
    font-weight: $font-weight-semibold;
    color: $primary-dark;
  }
  // 后端 placeholder 内的元素
  &__item-content-html :deep(.agreement-placeholder) {
    text-align: center;
  }
  &__item-content-html :deep(.agreement-placeholder__emoji) {
    font-size: 64rpx;
    margin-bottom: $spacing-sm;
  }
  &__item-content-html :deep(.agreement-placeholder__tip) {
    font-size: $font-xs;
    color: $text-tertiary;
    margin-top: $spacing-md;
  }

  &__item-loading {
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
    padding: $spacing-md;
  }

  &__item-agree {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: $spacing-xs;
    padding: $spacing-sm 0;
    border-radius: $radius-pill;
    font-size: $font-sm;
    color: $text-secondary;
    background: $bg-card;
    transition: all $transition-fast;
    &:active {
      transform: scale(0.98);
    }
    &--on {
      color: $primary-dark;
      background: $primary-lighter;
    }
  }
  &__item-agree-icon {
    width: 32rpx;
    height: 32rpx;
    border-radius: 50%;
    border: 2rpx solid $divider;
    background: $bg-card;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all $transition-fast;
  }
  // 父级 --on 时 (BEM 嵌套) 子 icon 也切主色
  &__item-agree--on &__item-agree-icon {
    background: $primary;
    border-color: $primary;
  }
  &__item-agree-icon text {
    color: #fff;
    font-size: $font-xs;
    line-height: 1;
  }
  &__item-agree-text {
    font-weight: $font-weight-medium;
  }

  &__footer {
    padding: $spacing-md;
    border-top: 1rpx solid $divider-light;
    flex-shrink: 0;
  }

  &__btn {
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    text-align: center;
    box-shadow: $shadow-button;

    &--disabled {
      background: $divider;
      box-shadow: none;
    }
  }

  &__btn-text {
    color: #fff;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
  }
}
</style>
