<!--
  PetAdopt - C 端宠物领养引导页 (2026-07-07 立项)
  设计思路:
    - 不是自助流程, 而是「联系老师领养」引导页
    - 顶部: 多色蛋 SVG 展示, 让小朋友对"即将拥有的小伙伴"有期待
    - 中部: 4 步领养流程 (来校 → 联系 → 选蛋 → 期待)
    - 底部: 主 CTA 联系老师 (调机构联系方式, uni.makePhoneCall)
              副 CTA 复制微信号
              文字链 → 机构主页查看完整联系
-->
<template>
  <view class="adopt">
    <view class="adopt__top">
      <view class="adopt__back" @tap="goBack"><text>‹</text></view>
      <text class="adopt__title">领养宠物</text>
      <view class="adopt__back adopt__back--placeholder" />
    </view>

    <!-- ───── 蛋展示 (3 色, 摇摆动画) ───── -->
    <view class="adopt__eggs">
      <view class="adopt__egg adopt__egg--1">
        <text class="adopt__egg-emoji">🥚</text>
        <view class="adopt__egg-shine" />
      </view>
      <view class="adopt__egg adopt__egg--2">
        <text class="adopt__egg-emoji">🥚</text>
        <view class="adopt__egg-shine" />
      </view>
      <view class="adopt__egg adopt__egg--3">
        <text class="adopt__egg-emoji">🥚</text>
        <view class="adopt__egg-shine" />
      </view>
    </view>

    <text class="adopt__headline">领养孩子的小伙伴</text>
    <text class="adopt__subhead">选一颗蛋，让它陪伴孩子一起成长</text>

    <!-- ───── 4 步流程 ───── -->
    <view class="adopt__steps">
      <view class="adopt__step">
        <view class="adopt__step-num">1</view>
        <view class="adopt__step-body">
          <text class="adopt__step-title">📍 来学校</text>
          <text class="adopt__step-desc">带小朋友到校区前台</text>
        </view>
      </view>
      <view class="adopt__step">
        <view class="adopt__step-num">2</view>
        <view class="adopt__step-body">
          <text class="adopt__step-title">📞 联系老师</text>
          <text class="adopt__step-desc">告诉老师想领养宠物</text>
        </view>
      </view>
      <view class="adopt__step">
        <view class="adopt__step-num">3</view>
        <view class="adopt__step-body">
          <text class="adopt__step-title">🥚 选一颗蛋</text>
          <text class="adopt__step-desc">老师会带着小朋友选一颗</text>
        </view>
      </view>
      <view class="adopt__step">
        <view class="adopt__step-num">4</view>
        <view class="adopt__step-body">
          <text class="adopt__step-title">✨ 一起长大</text>
          <text class="adopt__step-desc">回家路上就已经开始期待</text>
        </view>
      </view>
    </view>

    <!-- ───── 联系方式卡片 ───── -->
    <view class="adopt__contact">
      <text class="adopt__contact-title">🏫 {{ orgName || '所在校区' }} 联系方式</text>

      <view v-if="loadingContact" class="adopt__contact-loading">
        <text>正在加载联系方式…</text>
      </view>

      <template v-else>
        <!-- 主 CTA: 电话 -->
        <view
          v-if="phone"
          class="adopt__cta adopt__cta--primary press"
          @tap="onCall"
        >
          <text class="adopt__cta-emoji">📞</text>
          <view class="adopt__cta-body">
            <text class="adopt__cta-label">拨打热线 · 联系老师领养</text>
            <text class="adopt__cta-phone">{{ phone }}</text>
          </view>
          <text class="adopt__cta-arrow">›</text>
        </view>

        <!-- 副 CTA: 微信 -->
        <view
          v-if="wechat"
          class="adopt__cta adopt__cta--secondary press"
          @tap="onCopyWx"
        >
          <text class="adopt__cta-emoji">💬</text>
          <view class="adopt__cta-body">
            <text class="adopt__cta-label">复制老师微信号</text>
            <text class="adopt__cta-phone">{{ wechat }}</text>
          </view>
          <text class="adopt__cta-arrow">›</text>
        </view>

        <!-- 营业时间提示 -->
        <view v-if="businessHours" class="adopt__hours">
          <text>⏰ {{ businessHours }}</text>
        </view>

        <!-- 兜底: 联系方式都没拉到 -->
        <view v-if="!phone && !wechat" class="adopt__contact-empty">
          <text>暂未公布联系方式，请直接到校区前台咨询老师 ›</text>
        </view>

        <!-- 文字链: 跳完整机构主页 -->
        <view class="adopt__more" @tap="goOrgHome">
          <text>查看完整校区介绍 ›</text>
        </view>
      </template>
    </view>

    <!-- 底部安全间距 -->
    <view class="adopt__bottom-spacer" />
  </view>
</template>

<script>
import { orgApi } from '@/api/org'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/components/common/Toast'
import { copyText } from '@/utils/share'
import { haptic } from '@/utils/haptic'

export default {
  data() {
    return {
      loadingContact: true,
      org: null,
      orgId: ''
    }
  },
  computed: {
    promo() {
      return this.org?.promotionSummary || null
    },
    phone() {
      return this.promo?.hotline || this.org?.contact?.phone || ''
    },
    wechat() {
      return this.promo?.serviceWechat || ''
    },
    businessHours() {
      return this.promo?.businessHours || ''
    },
    orgName() {
      return this.org?.nameAbbreviation || this.org?.name || ''
    }
  },
  onLoad(query) {
    // 走当前激活机构 (与 org/home 同款)
    const id = (query && query.id) || useAuthStore().currentOrgId
    if (id) this.orgId = id
    this.loadContact()
  },
  onShow() {
    // 兜底: onLoad 时 store 还没就绪的情况
    if (!this.orgId && useAuthStore().currentOrgId) {
      this.orgId = useAuthStore().currentOrgId
      this.loadContact()
    }
  },
  methods: {
    async loadContact() {
      if (!this.orgId) {
        this.loadingContact = false
        return
      }
      this.loadingContact = true
      try {
        const data = await orgApi.public(this.orgId)
        // http 拦截器兼容 [memory: http-interceptor-actually-unpacked]
        const d = data?.data || data || {}
        this.org = {
          id: d.id,
          name: d.name,
          nameAbbreviation: d.nameAbbreviation,
          contact: d.contact,
          promotionSummary: d.promotionSummary
        }
      } catch (e) {
        console.warn('[petAdopt.loadContact]', e)
        this.org = null
      } finally {
        this.loadingContact = false
      }
    },

    onCall() {
      if (!this.phone) return toast.text('暂无电话')
      haptic.tap()
      uni.makePhoneCall({ phoneNumber: this.phone, fail: () => {} })
    },

    async onCopyWx() {
      if (!this.wechat) return toast.text('暂无微信号')
      haptic.tap()
      const ok = await copyText(this.wechat)
      toast[ok ? 'success' : 'error'](ok ? '已复制微信号，去微信添加吧' : '复制失败')
    },

    goOrgHome() {
      const url = this.orgId ? `/pages/org/home?id=${this.orgId}` : '/pages/org/home'
      uni.navigateTo({ url })
    },

    goBack() {
      uni.navigateBack({ delta: 1 })
    }
  }
}
</script>

<style lang="scss" scoped>
.adopt {
  min-height: 100vh;
  background: linear-gradient(180deg, #FFE4D3 0%, #FFFAF5 60%);
  padding-top: env(safe-area-inset-top, 0);
  padding-bottom: env(safe-area-inset-bottom, 0);

  &__top {
    display: flex;
    align-items: center;
    padding: $spacing-md $spacing-lg;
    gap: $spacing-sm;
  }
  &__back {
    width: 64rpx; height: 64rpx;
    flex-shrink: 0;
    background: $bg-card;
    border-radius: 50%;
    @include flex-center;
    box-shadow: $shadow-card;
    font-size: 48rpx;
    color: $text-secondary;
    cursor: pointer;
    &--placeholder { background: transparent; box-shadow: none; }
  }
  &__title {
    flex: 1;
    text-align: center;
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  // ───── 三色蛋展示 ─────
  &__eggs {
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: $spacing-md;
    padding: $spacing-lg $spacing-lg $spacing-sm;
    min-height: 240rpx;
  }
  &__egg {
    position: relative;
    width: 140rpx;
    height: 180rpx;
    border-radius: 50% / 60%;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.28);
  }
  &__egg-1 {
    background: linear-gradient(135deg, #FFC9A4, #FF8A65);
    animation: float-a 3s ease-in-out infinite;
  }
  &__egg-2 {
    background: linear-gradient(135deg, #FFE3B0, #F5C148);
    width: 160rpx;
    height: 210rpx;
    animation: float-b 3.4s ease-in-out infinite;
  }
  &__egg-3 {
    background: linear-gradient(135deg, #FFD0DC, #F56C8C);
    animation: float-a 3.2s ease-in-out infinite;
  }
  &__egg-emoji {
    font-size: 80rpx;
    filter: drop-shadow(0 4rpx 8rpx rgba(0, 0, 0, 0.15));
  }
  // 高光
  &__egg-shine {
    position: absolute;
    top: 14%;
    left: 22%;
    width: 22%;
    height: 18%;
    background: rgba(255, 255, 255, 0.55);
    border-radius: 50%;
    pointer-events: none;
  }
  @keyframes float-a {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-12rpx); }
  }
  @keyframes float-b {
    0%, 100% { transform: translateY(0); }
    50%      { transform: translateY(-18rpx); }
  }

  &__headline {
    display: block;
    text-align: center;
    font-size: $font-xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-top: $spacing-md;
  }
  &__subhead {
    display: block;
    text-align: center;
    font-size: $font-base;
    color: $text-secondary;
    margin: $spacing-xs 0 $spacing-lg;
    padding: 0 $spacing-lg;
  }

  // ───── 4 步流程卡 ─────
  &__steps {
    margin: 0 $spacing-lg $spacing-lg;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-lg;
    box-shadow: $shadow-card;
    display: flex;
    flex-direction: column;
    gap: $spacing-md;
  }
  &__step {
    display: flex;
    align-items: center;
    gap: $spacing-md;
  }
  &__step-num {
    flex-shrink: 0;
    width: 56rpx;
    height: 56rpx;
    border-radius: 50%;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    @include flex-center;
    box-shadow: 0 4rpx 12rpx rgba(255, 138, 101, 0.4);
  }
  &__step-body { flex: 1; min-width: 0; }
  &__step-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 2rpx;
  }
  &__step-desc {
    display: block;
    font-size: $font-sm;
    color: $text-secondary;
  }

  // ───── 联系方式卡 ─────
  &__contact {
    margin: 0 $spacing-lg;
    padding: $spacing-lg $spacing-md;
    background: $bg-card;
    border-radius: $radius-lg;
    box-shadow: $shadow-card;
  }
  &__contact-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-md;
  }
  &__contact-loading {
    text-align: center;
    color: $text-tertiary;
    font-size: $font-sm;
    padding: $spacing-md 0;
  }
  &__contact-empty {
    text-align: center;
    color: $text-secondary;
    font-size: $font-sm;
    padding: $spacing-md 0;
  }

  // CTA 按钮 (主 + 副)
  &__cta {
    display: flex;
    align-items: center;
    gap: $spacing-md;
    padding: $spacing-md;
    border-radius: $radius-md;
    margin-bottom: $spacing-sm;
    cursor: pointer;
    transition: all $transition-fast;
    box-sizing: border-box;
    max-width: 100%;

    &--primary {
      background: linear-gradient(135deg, $primary, $primary-light);
      color: #fff;
      box-shadow: 0 6rpx 16rpx rgba(255, 138, 101, 0.32);
    }
    &--secondary {
      background: $bg-page;
      color: $text-primary;
      border: 2rpx solid $divider;
    }
  }
  &__cta-emoji {
    font-size: 56rpx;
    flex-shrink: 0;
  }
  &__cta-body {
    flex: 1;
    min-width: 0;
    overflow: hidden;
  }
  &__cta-label {
    display: block;
    font-size: $font-sm;
    font-weight: $font-weight-semibold;
    margin-bottom: 2rpx;
  }
  &__cta-phone {
    display: block;
    font-size: $font-lg;
    font-weight: $font-weight-bold;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__cta-arrow {
    font-size: 48rpx;
    flex-shrink: 0;
    opacity: 0.7;
  }
  // 主 CTA 的子元素颜色覆盖
  &__cta--primary .adopt__cta-label,
  &__cta--primary .adopt__cta-phone,
  &__cta--primary .adopt__cta-arrow {
    color: #fff;
  }

  &__hours {
    text-align: center;
    margin-top: $spacing-sm;
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__more {
    text-align: center;
    margin-top: $spacing-md;
    font-size: $font-sm;
    color: $primary;
    cursor: pointer;
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>