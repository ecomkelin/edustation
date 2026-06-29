<!--
  发现 Tab - 课程产品 + 机构主页入口 + 我的报名
-->
<template>
  <view class="discover">
    <view class="discover__header">
      <text class="discover__title">探索更多课程</text>
      <text class="discover__sub">找到适合孩子的成长之路</text>
    </view>

    <scroll-view scroll-y class="discover__body" @scrolltolower="onLower">
      <!-- 机构信息卡 -->
      <view class="discover__org" v-if="orgPromotion">
        <view class="discover__org-banner">
          <text class="discover__org-emoji">🏫</text>
        </view>
        <view class="discover__org-info">
          <text class="discover__org-name">{{ orgPromotion.name || '当前机构' }}</text>
          <text v-if="orgPromotion.slogan" class="discover__org-slogan">{{ orgPromotion.slogan }}</text>
          <view v-if="orgPromotion.hotline || orgPromotion.contactPhone" class="discover__org-phone">
            <text>📞 {{ orgPromotion.hotline || orgPromotion.contactPhone }}</text>
          </view>
        </view>
      </view>

      <!-- 我的报名入口 -->
      <view class="discover__enroll-card press" @tap="goPage('/pages/course/enrollment-list')">
        <view class="discover__enroll-icon">
          <text>📋</text>
        </view>
        <view class="discover__enroll-info">
          <text class="discover__enroll-title">我的报名</text>
          <text class="discover__enroll-desc">查看所有在读课程</text>
        </view>
        <text class="discover__enroll-arrow">›</text>
      </view>

      <!-- 课程列表 -->
      <view class="discover__section">
        <view class="section-title">
          <text>🌟 推荐课程</text>
          <text class="section-title__more">{{ totalCount }} 门课程</text>
        </view>

        <view v-if="loading" class="discover__skeleton-list">
          <view v-for="i in 3" :key="i" class="discover__skeleton" />
        </view>

        <empty-state
          v-else-if="!products.length"
          title="还没有上架课程"
          desc="请联系机构老师"
          emoji="📚"
          bg-color="#E5F0FA"
        />

        <view v-else class="discover__list">
          <view
            v-for="p in products"
            :key="p._id"
            class="discover__card press"
            @tap="goDetail(p._id)"
          >
            <view class="discover__card-cover">
              <text class="discover__card-emoji">{{ emojiOf(p.subject?.name) }}</text>
            </view>
            <view class="discover__card-body">
              <view class="discover__card-header">
                <text class="discover__card-title">{{ p.name }}</text>
                <view v-if="p.promotionActive" class="tag tag-warn">
                  <text>促销</text>
                </view>
              </view>
              <text class="discover__card-subject">{{ p.subject?.name || '通用' }} · {{ p.totalLessons }} 课时</text>
              <text v-if="p.description" class="discover__card-desc">{{ p.description }}</text>
              <view class="discover__card-footer">
                <view class="discover__card-price">
                  <text class="discover__card-price-cur">¥</text>
                  <text class="discover__card-price-val">{{ formatPrice(p) }}</text>
                  <text v-if="p.promotionActive && p.originalPrice > (p.promotionPrice || 0)" class="discover__card-price-orig">
                    ¥{{ p.originalPrice }}
                  </text>
                </view>
                <view class="discover__card-action">
                  <text>查看 ›</text>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view class="discover__bottom-spacer" />
    </scroll-view>
  </view>
</template>

<script>
import EmptyState from '@/components/common/EmptyState.vue'
import { courseProductApi } from '@/api/courseProduct'
import { orgApi } from '@/api/org'
import { useAuthStore } from '@/stores/auth'
import { useSiteConfigStore } from '@/stores/siteConfig'
import { formatMoney } from '@/utils/format'

export default {
  components: { EmptyState },
  data() {
    return {
      loading: true,
      products: [],
      totalCount: 0,
      orgPromotion: null
    }
  },
  computed: {
    orgId() {
      return useAuthStore().currentOrgId
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        const res = await courseProductApi.list({ isActive: true })
        let list = res
        if (res && Array.isArray(res.items)) list = res.items
        else if (res && Array.isArray(res.data)) list = res.data
        else if (!Array.isArray(res)) list = []
        this.products = list.map((p) => ({ ...p, _id: p._id || p.id }))
        this.totalCount = list.length
      } catch (e) {
        console.warn('[discover.load]', e)
        this.products = []
      } finally {
        this.loading = false
      }
      // 机构信息
      if (this.orgId) {
        try {
          this.orgPromotion = await orgApi.promotion(this.orgId)
        } catch (_) {
          this.orgPromotion = null
        }
      }
    },

    formatPrice(p) {
      if (p.promotionActive && p.promotionPrice) return formatMoney(p.promotionPrice, false)
      if (p.discountPrice) return formatMoney(p.discountPrice, false)
      if (p.price) return formatMoney(p.price, false)
      return '面议'
    },

    emojiOf(name) {
      const map = {
        美术: '🎨', 音乐: '🎵', 舞蹈: '💃', 体育: '⚽',
        编程: '💻', 乐高: '🧱', 数学: '🔢', 英语: '🌐',
        语文: '📖', 科学: '🔬', 书法: '✍️', 棋类: '♟️',
        国画: '🖌️', 围棋: '⚫', 钢琴: '🎹', 跆拳道: '🥋'
      }
      for (const k in map) {
        if (name && name.includes(k)) return map[k]
      }
      return '🎒'
    },

    goDetail(id) {
      uni.navigateTo({ url: `/pages/course/product-detail?id=${id}` })
    },

    goPage(url) {
      uni.navigateTo({ url })
    },

    onLower() {}
  }
}
</script>

<style lang="scss" scoped>
.discover {
  min-height: 100vh;
  background: $bg-page;
  padding-top: env(safe-area-inset-top);

  &__header {
    padding: $spacing-md $spacing-md $spacing-sm;
    background: linear-gradient(180deg, #FFE4D3 0%, $bg-page 100%);
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

  &__body {
    padding: 0 $spacing-md;
    height: calc(100vh - 120rpx);
  }

  &__org {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    border-radius: $radius-md;
    margin-top: $spacing-sm;
    box-shadow: $shadow-button;
    color: #fff;
  }

  &__org-banner {
    width: 96rpx;
    height: 96rpx;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 24rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-right: $spacing-md;
  }

  &__org-emoji {
    font-size: 56rpx;
  }

  &__org-info {
    flex: 1;
  }

  &__org-name {
    display: block;
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: #fff;
    margin-bottom: 4rpx;
  }

  &__org-slogan {
    display: block;
    font-size: $font-xs;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.4;
    margin-bottom: 4rpx;
  }

  &__org-phone {
    font-size: $font-xs;
    color: rgba(255, 255, 255, 0.85);
  }

  &__enroll-card {
    display: flex;
    align-items: center;
    padding: $spacing-md;
    background: $bg-card;
    border-radius: $radius-md;
    margin-top: $spacing-sm;
    box-shadow: $shadow-card;
  }

  &__enroll-icon {
    width: 80rpx;
    height: 80rpx;
    background: $primary-lighter;
    border-radius: 20rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 40rpx;
    margin-right: $spacing-md;
  }

  &__enroll-info {
    flex: 1;
  }

  &__enroll-title {
    display: block;
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: 4rpx;
  }

  &__enroll-desc {
    display: block;
    font-size: $font-xs;
    color: $text-secondary;
  }

  &__enroll-arrow {
    font-size: 40rpx;
    color: $text-tertiary;
  }

  &__section {
    padding: $spacing-md 0;
  }

  &__skeleton-list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__skeleton {
    height: 240rpx;
    background: linear-gradient(90deg, $divider-light, #f8f4ee, $divider-light);
    background-size: 200% 100%;
    border-radius: $radius-md;
    animation: shimmer 1.5s ease-in-out infinite;
  }

  &__list {
    display: flex;
    flex-direction: column;
    gap: $spacing-sm;
  }

  &__card {
    display: flex;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    overflow: hidden;
    transition: all $transition-fast;

    &:active {
      transform: scale(0.98);
    }
  }

  &__card-cover {
    width: 180rpx;
    flex-shrink: 0;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__card-emoji {
    font-size: 80rpx;
  }

  &__card-body {
    flex: 1;
    padding: $spacing-sm $spacing-md;
    display: flex;
    flex-direction: column;
  }

  &__card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4rpx;
  }

  &__card-title {
    font-size: $font-md;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    flex: 1;
    margin-right: $spacing-xs;
    @include multi-ellipsis(1);
  }

  &__card-subject {
    font-size: $font-xs;
    color: $text-secondary;
    margin-bottom: $spacing-xs;
  }

  &__card-desc {
    font-size: $font-xs;
    color: $text-tertiary;
    line-height: 1.5;
    margin-bottom: $spacing-xs;
    @include multi-ellipsis(2);
  }

  &__card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: auto;
  }

  &__card-price {
    display: flex;
    align-items: baseline;
    gap: 4rpx;
  }

  &__card-price-cur {
    font-size: $font-sm;
    color: $primary;
    font-weight: $font-weight-semibold;
  }

  &__card-price-val {
    font-size: $font-lg;
    color: $primary;
    font-weight: $font-weight-bold;
  }

  &__card-price-orig {
    font-size: $font-xs;
    color: $text-tertiary;
    text-decoration: line-through;
    margin-left: 4rpx;
  }

  &__card-action {
    font-size: $font-xs;
    color: $primary;
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>