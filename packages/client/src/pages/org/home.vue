<!--
  机构主页 (R-0932 /orgs/:id/public)
  2026-07-02 立项 (推广信息 + 联系方式)
  2026-07-03 同日扩展: 学科 + 老师 + 课程产品 (即"课包") 3 个 section
-->
<template>
  <view class="org-home">
    <!-- loading 态 -->
    <view v-if="loading && !org" class="org-home__loading">
      <text>召唤中…</text>
    </view>

    <view v-else-if="!org" class="org-home__empty">
      <text class="org-home__empty-emoji">🏫</text>
      <text class="org-home__empty-title">机构信息加载失败</text>
      <text class="org-home__empty-desc">请稍后再试 ›</text>
    </view>

    <template v-else>
      <!-- 顶部封皮 + Logo -->
      <view class="org-home__cover">
        <view class="org-home__cover-bg" />
        <view class="org-home__logo">
          <text class="org-home__logo-emoji">🏫</text>
        </view>
      </view>

      <view class="org-home__main">
        <!-- 基础信息 -->
        <view class="org-home__name">
          <text class="org-home__name-text">{{ org.name || '机构名称' }}</text>
          <text v-if="org.nameAbbreviation" class="org-home__name-sub">{{ org.nameAbbreviation }}</text>
          <!-- 停用红牌 -->
          <view v-if="!org.isActive" class="org-home__inactive">
            <text>⛔ 该机构暂未开放</text>
          </view>
        </view>

        <view v-if="promo?.description" class="org-home__slogan">
          <text>{{ promo.description }}</text>
        </view>

        <!-- 联系方式 4 个快捷键 -->
        <view class="org-home__quick">
          <view class="org-home__quick-item press" @tap="onCall">
            <view class="org-home__quick-icon org-home__quick-icon--phone">📞</view>
            <text class="org-home__quick-label">电话</text>
          </view>
          <view class="org-home__quick-item press" @tap="onLocation">
            <view class="org-home__quick-icon org-home__quick-icon--location">📍</view>
            <text class="org-home__quick-label">地址</text>
          </view>
          <view class="org-home__quick-item press" @tap="onWx">
            <view class="org-home__quick-icon org-home__quick-icon--wx">💬</view>
            <text class="org-home__quick-label">微信</text>
          </view>
          <view class="org-home__quick-item press" @tap="onShare">
            <view class="org-home__quick-icon org-home__quick-icon--share">🚀</view>
            <text class="org-home__quick-label">分享</text>
          </view>
        </view>

        <!-- 关于我们 -->
        <view v-if="promo?.brandStory" class="org-home__section">
          <text class="org-home__section-title">🏛 关于我们</text>
          <view class="org-home__section-content">
            <text>{{ promo.brandStory }}</text>
          </view>
        </view>

        <!-- 学科 (2026-07-03: R-0932 扩展 subjects[]) -->
        <view v-if="subjects.length" class="org-home__section">
          <text class="org-home__section-title">📚 我们的学科</text>
          <view class="org-home__chips">
            <view
              v-for="s in subjects"
              :key="s.key"
              class="org-home__chip"
            >
              <text>{{ s.name }}</text>
            </view>
          </view>
        </view>

        <!-- 老师 (R-0932 扩展 teachers[]) -->
        <view v-if="teachers.length" class="org-home__section">
          <view class="org-home__section-title-row">
            <text class="org-home__section-title">👨‍🏫 名师团队 ({{ teachers.length }})</text>
          </view>
          <scroll-view scroll-x class="org-home__teacher-scroller" show-scrollbar="false">
            <view class="org-home__teacher-inner">
              <view
                v-for="t in teachers"
                :key="t.id"
                class="org-home__teacher-card"
              >
                <view class="org-home__teacher-avatar">
                  <SvgAvatar
                    :svg-key="t.avatarSvgKey || null"
                    :size="56"
                    audience="user"
                  />
                </view>
                <text class="org-home__teacher-name">{{ t.realName }}</text>
                <text v-if="t.title" class="org-home__teacher-title">{{ t.title }}</text>
              </view>
            </view>
          </scroll-view>
        </view>

        <!-- 课程产品 / 课包 (R-0932 扩展 products[]) -->
        <view v-if="products.length" class="org-home__section">
          <view class="org-home__section-title-row">
            <text class="org-home__section-title">🎒 课程产品</text>
            <text class="section-title__more">{{ products.length }} 门</text>
          </view>
          <view class="org-home__products">
            <view
              v-for="p in products"
              :key="p.id"
              class="org-home__product-card press"
              @tap="goProductDetail(p.id)"
            >
              <view class="org-home__product-cover">
                <text class="org-home__product-emoji">{{ emojiOf(p.subject?.name) }}</text>
              </view>
              <view class="org-home__product-body">
                <text class="org-home__product-name">{{ p.name }}</text>
                <text class="org-home__product-subject">
                  {{ p.subject?.name || '通用' }} · {{ p.totalLessons }} 课时
                </text>
                <view class="org-home__product-footer">
                  <view class="org-home__product-price">
                    <text class="org-home__product-price-cur">¥</text>
                    <text class="org-home__product-price-val">{{ formatPrice(p) }}</text>
                    <text
                      v-if="p.promotionActive && p.originalPrice > (p.promotionPrice || 0)"
                      class="org-home__product-price-orig"
                    >
                      ¥{{ p.originalPrice }}
                    </text>
                  </view>
                  <text class="org-home__product-cta">查看 ›</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <!-- 教学特色 -->
        <view v-if="promo?.teachingFeatures?.length" class="org-home__section">
          <text class="org-home__section-title">⭐ 教学特色</text>
          <view class="org-home__chips">
            <view
              v-for="(f, i) in promo.teachingFeatures"
              :key="i"
              class="org-home__chip"
            >
              <text>{{ f }}</text>
            </view>
          </view>
        </view>

        <!-- 师资介绍 (OrgPromotion.facultyIntro 文本) -->
        <view v-if="promo?.facultyIntro" class="org-home__section">
          <text class="org-home__section-title">💬 师资介绍</text>
          <view class="org-home__section-content">
            <text>{{ promo.facultyIntro }}</text>
          </view>
        </view>

        <!-- 地址信息 -->
        <view v-if="org.address" class="org-home__section">
          <text class="org-home__section-title">📍 地址信息</text>
          <view class="org-home__address" @tap="onLocation">
            <text>{{ org.address }}</text>
            <text class="org-home__address-arrow">›</text>
          </view>
        </view>

        <!-- 联系方式 -->
        <view v-if="hasContact" class="org-home__section">
          <text class="org-home__section-title">📞 联系方式</text>
          <view v-if="promo?.hotline || org.contact?.phone" class="org-home__contact-row">
            <text class="org-home__contact-key">☎️ 热线</text>
            <text class="org-home__contact-val">{{ promo?.hotline || org.contact?.phone }}</text>
          </view>
          <view v-if="promo?.serviceWechat" class="org-home__contact-row">
            <text class="org-home__contact-key">💬 微信</text>
            <text class="org-home__contact-val">{{ promo.serviceWechat }}</text>
          </view>
          <view v-if="promo?.businessHours" class="org-home__contact-row">
            <text class="org-home__contact-key">⏰ 营业</text>
            <text class="org-home__contact-val">{{ promo.businessHours }}</text>
          </view>
        </view>
      </view>

      <view class="org-home__bottom-spacer" />
    </template>
  </view>
</template>

<script>
import { orgApi } from '@/api/org'
import { useAuthStore } from '@/stores/auth'
import { toast } from '@/components/common/Toast'
import { copyText } from '@/utils/share'
import { formatMoney } from '@/utils/format'
import { haptic } from '@/utils/haptic'
import SvgAvatar from '@/components/Avatar/SvgAvatar.vue'

export default {
  components: { SvgAvatar },
  data() {
    return {
      loading: true,
      org: null,
      // 2026-07-03: onLoad 时存 query.id (未传则用 currentOrgId)
      orgId: '',
      // 2026-07-03: R-0932 扩展三段
      subjects: [],
      teachers: [],
      products: []
    }
  },
  computed: {
    promo() {
      return this.org?.promotionSummary || null
    },
    hasContact() {
      return this.promo?.hotline || this.org?.contact?.phone || this.promo?.serviceWechat || this.promo?.businessHours
    }
  },
  onLoad(query) {
    // 2026-07-03: 支持 onLoad(options.id) 跳转, 默认走当前激活机构
    const id = (query && query.id) || useAuthStore().currentOrgId
    if (id) this.orgId = id
    this.load()
  },
  // 重设当前激活机构时 (rare) 重新拉取
  onShow() {
    if (this.orgId && !this.org) this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const data = await orgApi.public(this.orgId)
        // http 拦截器可能返 res.data 或 res, 兼容 [memory: http-interceptor-actually-unpacked]
        const d = data?.data || data || {}
        this.org = {
          id: d.id,
          name: d.name,
          nameAbbreviation: d.nameAbbreviation,
          type: d.type,
          logo: d.logo,
          address: d.address,
          establishedDate: d.establishedDate,
          isActive: d.isActive,
          contact: d.contact,
          promotionSummary: d.promotionSummary
        }
        this.subjects = Array.isArray(d.subjects) ? d.subjects : []
        this.teachers = Array.isArray(d.teachers) ? d.teachers : []
        this.products = Array.isArray(d.products) ? d.products : []
      } catch (e) {
        console.warn('[orgHome.load]', e)
        this.org = null
        this.subjects = []
        this.teachers = []
        this.products = []
      } finally {
        this.loading = false
      }
    },

    onCall() {
      const phone = this.promo?.hotline || this.org?.contact?.phone
      if (!phone) return toast.text('暂无电话')
      uni.makePhoneCall({ phoneNumber: phone, fail: () => {} })
    },

    onLocation() {
      if (!this.org?.address) return toast.text('暂无地址')
      const lat = this.promo?.latitude
      const lng = this.promo?.longitude
      uni.openLocation({
        // 没填经纬度时兜底默认 0/0 (小程序 openLocation 必填)
        latitude: typeof lat === 'number' ? lat : 30.0,
        longitude: typeof lng === 'number' ? lng : 105.0,
        name: this.org.name,
        address: this.org.address,
        scale: 16
      })
    },

    async onWx() {
      const wx = this.promo?.serviceWechat
      if (!wx) return toast.text('暂无微信号')
      const ok = await copyText(wx)
      toast[ok ? 'success' : 'error'](ok ? '已复制微信号' : '复制失败')
    },

    onShare() {
      haptic.tap()
      toast.text('长按右上角分享给朋友')
    },

    goProductDetail(id) {
      if (!id) return
      haptic.tap()
      uni.navigateTo({ url: `/pages/course/product-detail?id=${id}` })
    },

    formatPrice(p) {
      if (p.promotionActive && p.promotionPrice) return formatMoney(p.promotionPrice, false)
      if (p.price) return formatMoney(p.price, false)
      return '面议'
    },

    emojiOf(name) {
      const map = {
        美术: '🎨', 音乐: '🎵', 舞蹈: '💃', 体育: '⚽',
        编程: '💻', 乐高: '🧱', 数学: '🔢', 英语: '🌐',
        语文: '📖', 科学: '🔬', 书法: '✍️', 棋类: '♟️',
        国画: '🖌️', 围棋: '⚫', 钢琴: '🎹', 跆拳道: '🥷'
      }
      for (const k in map) {
        if (name && name.includes(k)) return map[k]
      }
      return '🎒'
    }
  }
}
</script>

<style lang="scss" scoped>
.org-home {
  min-height: 100vh;
  background: $bg-page;

  &__loading,
  &__empty {
    @include flex-center;
    flex-direction: column;
    padding: 240rpx $spacing-md;
    text-align: center;
  }
  &__empty-emoji {
    font-size: 96rpx;
    margin-bottom: $spacing-md;
  }
  &__empty-title {
    font-size: $font-lg;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }
  &__empty-desc {
    font-size: $font-sm;
    color: $text-tertiary;
  }

  &__cover {
    height: 360rpx;
    background: linear-gradient(135deg, $primary 0%, $primary-light 50%, $accent-light 100%);
    position: relative;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: 0;
  }

  &__cover-bg {
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 20% 30%, rgba(255,255,255,0.4), transparent 50%);
  }

  &__logo {
    width: 160rpx;
    height: 160rpx;
    background: $bg-card;
    border-radius: 36rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 16rpx 32rpx rgba(0, 0, 0, 0.18);
    margin-bottom: -80rpx;
    position: relative;
    z-index: 1;
  }

  &__logo-emoji {
    font-size: 80rpx;
  }

  &__main {
    padding: $spacing-2xl $spacing-md $spacing-md;
  }

  &__name {
    text-align: center;
    margin-bottom: $spacing-md;
  }

  &__name-text {
    display: block;
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__name-sub {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__inactive {
    display: inline-block;
    margin-top: $spacing-sm;
    padding: 6rpx 16rpx;
    background: rgba(255, 77, 79, 0.12);
    color: #FF4D4F;
    font-size: $font-xs;
    border-radius: $radius-pill;
  }

  &__slogan {
    text-align: center;
    padding: $spacing-sm $spacing-md;
    background: $primary-lighter;
    border-radius: $radius-pill;
    color: $primary-dark;
    font-size: $font-sm;
    margin: 0 auto $spacing-md;
    max-width: 80%;
  }

  &__quick {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md $spacing-sm;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }

  &__quick-item {
    @include flex-center;
    flex-direction: column;
  }

  &__quick-icon {
    width: 80rpx;
    height: 80rpx;
    border-radius: 20rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    margin-bottom: $spacing-xs;

    &--phone { background: $primary-lighter; }
    &--location { background: #E5F0FA; }
    &--wx { background: #C8F0DF; }
    &--share { background: #EDE3FA; }
  }

  &__quick-label {
    font-size: $font-xs;
    color: $text-primary;
  }

  &__section {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    box-shadow: $shadow-card;
    margin-bottom: $spacing-md;
  }

  &__section-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: $spacing-sm;
  }

  &__section-title {
    display: block;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  &__section-content {
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.8;
  }

  &__address {
    display: flex;
    align-items: center;
    padding: $spacing-sm;
    background: $bg-page;
    border-radius: $radius-sm;
    font-size: $font-sm;
    color: $text-primary;

    & > text:first-child {
      flex: 1;
    }
  }

  &__address-arrow {
    color: $text-tertiary;
    font-size: 32rpx;
  }

  // 学科 chip + 教学特色 chip 通用样式
  &__chips {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }
  &__chip {
    padding: 8rpx 20rpx;
    background: $primary-lighter;
    color: $primary-dark;
    font-size: $font-sm;
    border-radius: $radius-pill;

    & > text { color: inherit; }
  }

  // 老师横滑卡片
  &__teacher-scroller {
    margin: 0 (-$spacing-md);
    padding: 0 $spacing-md;
  }
  &__teacher-inner {
    display: inline-flex;
    gap: $spacing-sm;
    padding: $spacing-xs 0;
  }
  &__teacher-card {
    flex-shrink: 0;
    width: 160rpx;
    @include flex-center;
    flex-direction: column;
    padding: $spacing-sm;
    background: $bg-page;
    border-radius: $radius-md;
  }
  &__teacher-avatar {
    width: 88rpx;
    height: 88rpx;
    border-radius: 50%;
    background: $primary-lighter;
    @include flex-center;
    margin-bottom: $spacing-xs;
    overflow: hidden;
  }
  &__teacher-img { width: 100%; height: 100%; }
  &__teacher-emoji { font-size: 48rpx; }
  &__teacher-name {
    font-size: $font-sm;
    color: $text-primary;
    font-weight: $font-weight-medium;
    text-align: center;
    margin-bottom: 2rpx;
    @include multi-ellipsis(1);
    max-width: 100%;
  }
  &__teacher-title {
    font-size: $font-xs;
    color: $text-tertiary;
    text-align: center;
    @include multi-ellipsis(1);
    max-width: 100%;
  }

  // 课程产品卡
  &__products {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }
  &__product-card {
    display: flex;
    background: $bg-page;
    border-radius: $radius-md;
    overflow: hidden;
    transition: all $transition-fast;

    &:active {
      transform: scale(0.98);
    }
  }
  &__product-cover {
    width: 180rpx;
    flex-shrink: 0;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    @include flex-center;
  }
  &__product-emoji {
    font-size: 80rpx;
  }
  &__product-body {
    flex: 1;
    padding: $spacing-sm $spacing-md;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  &__product-name {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
    @include multi-ellipsis(1);
  }
  &__product-subject {
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }
  &__product-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: auto;
  }
  &__product-price {
    display: flex;
    align-items: baseline;
    gap: 4rpx;
  }
  &__product-price-cur {
    font-size: $font-sm;
    color: $primary;
    font-weight: $font-weight-semibold;
  }
  &__product-price-val {
    font-size: $font-lg;
    color: $primary;
    font-weight: $font-weight-bold;
  }
  &__product-price-orig {
    font-size: $font-xs;
    color: $text-tertiary;
    text-decoration: line-through;
    margin-left: 4rpx;
  }
  &__product-cta {
    font-size: $font-xs;
    color: $primary;
  }

  // 联系方式
  &__contact-row {
    display: flex;
    align-items: center;
    padding: $spacing-sm 0;
    border-bottom: 1rpx solid $divider-light;
    &:last-child { border-bottom: none; }
  }
  &__contact-key {
    width: 140rpx;
    font-size: $font-sm;
    color: $text-secondary;
    flex-shrink: 0;
  }
  &__contact-val {
    flex: 1;
    font-size: $font-sm;
    color: $text-primary;
    word-break: break-all;
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>
