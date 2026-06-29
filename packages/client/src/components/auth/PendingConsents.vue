<!--
  PendingConsents - 待签协议墙
  - 显示平台 + 机构所有待签协议
  - 用户必须全部签完才能继续
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
          我们准备了 {{ list.length }} 份协议,通读一遍就能继续使用
        </text>
      </view>

      <scroll-view scroll-y class="pending-consents__list">
        <view
          v-for="(item, i) in list"
          :key="item.key || i"
          class="pending-consents__item press"
          @tap="openOne(item)"
        >
          <view class="pending-consents__item-icon">
            <text>{{ iconOf(item) }}</text>
          </view>
          <view class="pending-consents__item-info">
            <text class="pending-consents__item-name">{{ item.title || item.key }}</text>
            <text class="pending-consents__item-meta">{{ metaOf(item) }}</text>
          </view>
          <view class="pending-consents__item-action">
            <text class="pending-consents__item-action-text">查看 ›</text>
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
            {{ canContinue ? `继续使用 (${signedCount}/${list.length})` : `请先签署 (${signedCount}/${list.length})` }}
          </text>
        </view>
      </view>
    </view>

    <!-- 单份协议弹窗 -->
    <agreement-modal
      v-if="current"
      :visible="!!current"
      :title="current.title || current.key"
      :content="currentContent"
      :version="current.version"
      @confirm="onSignOne"
      @cancel="current = null"
    />
  </view>
</template>

<script>
import { legalApi } from '@/api/legal'
import AgreementModal from './AgreementModal.vue'
import { haptic } from '@/utils/haptic'

export default {
  name: 'PendingConsents',
  components: { AgreementModal },
  props: {
    visible: { type: Boolean, default: false },
    list: { type: Array, default: () => [] }
  },
  emits: ['done', 'close'],
  data() {
    return {
      current: null,
      currentContent: '',
      signed: {} // key -> version
    }
  },
  computed: {
    signedCount() {
      return Object.keys(this.signed).length
    },
    canContinue() {
      return this.signedCount >= this.list.length
    }
  },
  methods: {
    iconOf(item) {
      const k = (item.key || '').toLowerCase()
      if (k.includes('privacy') || k.includes('privacy')) return '🔒'
      if (k.includes('user') || k.includes('service')) return '🤝'
      if (k.includes('face') || k.includes('biometric')) return '👤'
      if (k.includes('minor') || k.includes('child')) return '🧒'
      return '📄'
    },
    metaOf(item) {
      const parts = []
      if (item.scope) parts.push(item.scope === 'platform' ? '平台协议' : '机构协议')
      if (item.version) parts.push('v' + item.version)
      if (item.effectiveAt) parts.push('生效于 ' + (item.effectiveAt || '').slice(0, 10))
      return parts.join(' · ')
    },
    async openOne(item) {
      haptic.tap()
      this.current = item
      try {
        const res = await this._fetchContent(item)
        let raw = res.content || res.html || res.text || ''
        // 后端 markdown 占位文字 → 让前端走 placeholder 渲染
        const isPlaceholder = !raw ||
          raw.includes('暂未提供协议正文') ||
          /^<!--\s*占位待法务审阅/.test(raw.trim())
        if (isPlaceholder) {
          raw = '' // 让 AgreementModal 走 placeholder HTML
        }
        this.currentContent = raw
      } catch (e) {
        this.currentContent = '' // 加载失败也走 placeholder
      }
    },

    async _fetchContent(item) {
      if (item.scope === 'platform') {
        return legalApi.platformDoc(item.key)
      }
      if (item.orgId) {
        return legalApi.orgDoc(item.orgId, item.key)
      }
      return {}
    },

    async onSignOne(version) {
      if (!this.current) return
      haptic.success()
      try {
        await legalApi.sign({
          key: this.current.key,
          version,
          scope: this.current.scope || 'platform'
        })
        this.signed[this.current.key] = version
        this.current = null
      } catch (e) {
        this.current = null
      }
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
    padding: 0 $spacing-md;
  }

  &__item {
    display: flex;
    align-items: center;
    padding: $spacing-sm $spacing-md;
    background: $bg-page;
    border-radius: $radius-md;
    margin-bottom: $spacing-sm;
    transition: all $transition-fast;

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
  }

  &__item-info {
    flex: 1;
  }

  &__item-name {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    line-height: 1.3;
  }

  &__item-meta {
    display: block;
    font-size: $font-xs;
    color: $text-secondary;
    margin-top: 4rpx;
  }

  &__item-action-text {
    font-size: $font-sm;
    color: $primary;
  }

  &__footer {
    padding: $spacing-md;
    border-top: 1rpx solid $divider-light;
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
      color: $text-tertiary;
    }
  }

  &__btn-text {
    color: #fff;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
  }
}
</style>