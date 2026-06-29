<!--
  宠物乐园 Tab - 三态:未领养/蛋/已破壳
-->
<template>
  <view class="pet-home">
    <view class="pet-home__top">
      <view class="pet-home__bg-circle pet-home__bg-circle--1" />
      <view class="pet-home__bg-circle pet-home__bg-circle--2" />

      <view class="pet-home__topbar safe-area-top">
        <text class="pet-home__title">🐾 宠物乐园</text>
        <view class="pet-home__topbar-right">
          <view class="pet-home__icon-btn press" @tap="goEvents">
            <text>📜</text>
          </view>
          <view class="pet-home__icon-btn press" @tap="goShop">
            <text>🛍️</text>
          </view>
        </view>
      </view>
    </view>

    <scroll-view scroll-y class="pet-home__body">
      <!-- 加载中 -->
      <view v-if="loading" class="pet-home__loading">
        <view class="pet-home__loading-circle" />
        <text>召唤小宠物中...</text>
      </view>

      <!-- 未报班 (不能领养) -->
      <view v-else-if="blockReason === 'notEnrolled'" class="pet-home__guide">
        <view class="pet-home__guide-art">
          <text class="pet-home__guide-emoji">🌱</text>
        </view>
        <text class="pet-home__guide-title">先报名一门课程吧</text>
        <text class="pet-home__guide-desc">
          报名后,孩子就可以领养属于自己的宠物伙伴啦
        </text>
        <view class="pet-home__guide-btn press" @tap="goDiscover">
          <text>去看看课程</text>
        </view>
      </view>

      <!-- 未领养 -->
      <view v-else-if="!pet" class="pet-home__guide">
        <view class="pet-home__guide-art">
          <text class="pet-home__guide-emoji">🥚</text>
        </view>
        <text class="pet-home__guide-title">领养孩子的第一位小伙伴</text>
        <text class="pet-home__guide-desc">
          选择一个蛋,让它陪伴孩子一起成长、学习、变强
        </text>
        <view class="pet-home__guide-btn press" @tap="goAdopt">
          <text>立即领养 ›</text>
        </view>
      </view>

      <!-- 蛋态 -->
      <view v-else-if="pet.state === 'egg'" class="pet-home__pet">
        <view class="pet-home__egg">
          <view class="pet-home__egg-emoji anim-bounce">🥚</view>
          <view class="pet-home__egg-label">{{ tierLabel }} · 待破壳</view>
        </view>
        <view class="pet-home__hatch-btn press" @tap="goHatch">
          <text>✨ 破壳看看</text>
        </view>
      </view>

      <!-- 已破壳 -->
      <view v-else class="pet-home__pet">
        <view class="pet-home__portrait-wrap">
          <view
            v-if="speciesRecord && speciesRecord.visualType === 'svg'"
            class="pet-home__portrait-svg"
            v-html="sanitizeSvg(speciesRecord.svgContent)"
          />
          <text v-else class="pet-home__portrait-emoji anim-float">
            {{ speciesEmoji }}
          </text>
          <view class="pet-home__tier-badge" :style="{ background: tierColor }">
            <text>{{ pet.tier }} 阶</text>
          </view>
        </view>

        <view class="pet-home__name-row">
          <text class="pet-home__name">{{ pet.nickname || speciesRecord?.name || '我的宠物' }}</text>
          <text class="pet-home__level">Lv.{{ pet.level }}</text>
        </view>

        <!-- 饱腹度 -->
        <view class="pet-home__stat">
          <view class="pet-home__stat-head">
            <text class="pet-home__stat-label">🍖 饱腹度</text>
            <text class="pet-home__stat-value">{{ pet.currentHunger }}/{{ pet.maxHunger }}</text>
          </view>
          <view class="pet-home__stat-bar">
            <view
              class="pet-home__stat-fill pet-home__stat-fill--hunger"
              :style="{ width: hungerPercent + '%' }"
            />
          </view>
        </view>

        <!-- 经验条 -->
        <view class="pet-home__stat">
          <view class="pet-home__stat-head">
            <text class="pet-home__stat-label">⭐ 经验</text>
            <text class="pet-home__stat-value">{{ pet.experience }}/{{ expToNext }}</text>
          </view>
          <view class="pet-home__stat-bar">
            <view
              class="pet-home__stat-fill pet-home__stat-fill--exp"
              :style="{ width: expPercent + '%' }"
            />
          </view>
        </view>

        <!-- 装备 -->
        <view class="pet-home__equip">
          <view class="pet-home__equip-title">🎀 当前装备</view>
          <view class="pet-home__equip-grid">
            <view
              v-for="(item, slot) in equippedMap"
              :key="slot"
              class="pet-home__equip-slot"
              :class="{ 'pet-home__equip-slot--empty': !item }"
              @tap="goEquip"
            >
              <text v-if="item" class="pet-home__equip-emoji">{{ item.icon || '🎀' }}</text>
              <text v-else class="pet-home__equip-empty">+</text>
              <text class="pet-home__equip-name">{{ slotLabel(slot) }}</text>
            </view>
          </view>
        </view>

        <!-- 操作按钮 -->
        <view class="pet-home__actions">
          <view class="pet-home__action press" @tap="goFeed">
            <view class="pet-home__action-icon pet-home__action-icon--feed">🍖</view>
            <text>喂食</text>
          </view>
          <view class="pet-home__action press" @tap="goEquip">
            <view class="pet-home__action-icon pet-home__action-icon--equip">🎀</view>
            <text>换装</text>
          </view>
          <view class="pet-home__action press" @tap="goShop">
            <view class="pet-home__action-icon pet-home__action-icon--shop">🛍️</view>
            <text>商店</text>
          </view>
          <view class="pet-home__action press" @tap="showMore = !showMore">
            <view class="pet-home__action-icon pet-home__action-icon--more">⋯</view>
            <text>更多</text>
          </view>
        </view>

        <!-- 更多菜单 -->
        <view v-if="showMore" class="pet-home__more anim-fade-in-up">
          <view class="pet-home__more-item press" @tap="onSwapEgg">
            <text>🔄 换蛋 (随机物种)</text>
          </view>
          <view class="pet-home__more-item press" @tap="onTierDown">
            <text>⬇️ 主动降阶</text>
          </view>
          <view class="pet-home__more-item press" @tap="onRename">
            <text>✏️ 改昵称</text>
          </view>
        </view>
      </view>

      <view class="pet-home__bottom-spacer" />
    </scroll-view>
  </view>
</template>

<script>
import { petApi } from '@/api/pet'
import { useStudentStore } from '@/stores/student'
import { toast } from '@/components/common/Toast'
import { haptic } from '@/utils/haptic'
import { PET_SPECIES_EMOJI, PetTierLabel } from '@/utils/constants'

const SLOT_LABELS = {
  hat: '帽子',
  scarf: '围巾',
  clothes: '衣服',
  accessory: '配饰',
  halo: '光环',
  background: '背景'
}

export default {
  data() {
    return {
      loading: true,
      pet: null,
      speciesRecord: null,
      equippedMap: {},
      showMore: false,
      blockReason: ''
    }
  },
  computed: {
    student() {
      return useStudentStore()
    },
    tierLabel() {
      return this.pet ? PetTierLabel[this.pet.tier || this.pet.eggTier || 'C'] : ''
    },
    tierColor() {
      const colors = { C: '#9CA3AF', B: '#7CD9B7', A: '#5B9EE6', S: '#F5C148' }
      return colors[this.pet?.tier || this.pet?.eggTier || 'C']
    },
    hungerPercent() {
      if (!this.pet) return 0
      return Math.max(0, Math.min(100, (this.pet.currentHunger / this.pet.maxHunger) * 100))
    },
    expToNext() {
      if (!this.pet) return 100
      const L = this.pet.level
      const tier = this.pet.tier || 'C'
      const formula = { C: 50 + L * 20, B: 80 + L * 30, A: 120 + L * 50, S: 200 + L * 80 }
      return formula[tier] || 100
    },
    expPercent() {
      if (!this.pet) return 0
      return Math.max(0, Math.min(100, (this.pet.experience / this.expToNext) * 100))
    },
    speciesEmoji() {
      const key = this.pet?.species
      return (key && PET_SPECIES_EMOJI[key]) || '🐾'
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      this.blockReason = ''
      try {
        const res = await petApi.me()
        this.pet = res || null
        // 拉 species 信息
        if (this.pet && this.pet.species) {
          try {
            const list = await petApi.species({ tier: this.pet.tier, isActive: true })
            const items = Array.isArray(list) ? list : list.items || list.data || []
            this.speciesRecord = items.find((s) => s.key === this.pet.species) || null
          } catch (_) {}
        }
        this._buildEquippedMap()
      } catch (e) {
        if (e.code === 'notEnrolled' || e.statusCode === 422) {
          this.blockReason = 'notEnrolled'
        }
        this.pet = null
      } finally {
        this.loading = false
      }
    },

    _buildEquippedMap() {
      if (!this.pet) return
      const slots = ['hat', 'scarf', 'clothes', 'accessory', 'halo', 'background']
      const eq = this.pet.equipped || {}
      this.equippedMap = {}
      slots.forEach((s) => {
        const key = eq[s]
        if (key) this.equippedMap[s] = { icon: '🎀', name: key }
        else this.equippedMap[s] = null
      })
    },

    sanitizeSvg(svg) {
      if (!svg) return ''
      // 简易防 XSS - 移除 script / onerror
      return String(svg)
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/on\w+="[^"]*"/gi, '')
    },

    slotLabel(s) {
      return SLOT_LABELS[s] || s
    },

    goAdopt() {
      uni.navigateTo({ url: '/pages/pet/adopt' })
    },
    goHatch() {
      uni.navigateTo({ url: '/pages/pet/hatch' })
    },
    goFeed() {
      uni.navigateTo({ url: '/pages/pet/feed' })
    },
    goEquip() {
      uni.navigateTo({ url: '/pages/pet/equip' })
    },
    goShop() {
      uni.navigateTo({ url: '/pages/pet/shop' })
    },
    goEvents() {
      uni.navigateTo({ url: '/pages/pet/events' })
    },
    goDiscover() {
      uni.switchTab({ url: '/pages/tabbar/discover' })
    },

    async onSwapEgg() {
      haptic.tap()
      uni.showModal({
        title: '换蛋',
        content: `当前阶位 ${this.pet.tier} 阶换蛋需要消耗积分,确定要换吗?`,
        success: async (res) => {
          if (!res.confirm) return
          try {
            await petApi.swapEgg()
            haptic.success()
            toast.success('已换新蛋!')
            this.load()
          } catch (e) {
            toast.error(e.message || '换蛋失败')
          }
        }
      })
    },

    onTierDown() {
      uni.showActionSheet({
        itemList: ['C 阶', 'B 阶', 'A 阶'],
        success: async (res) => {
          const tiers = ['C', 'B', 'A']
          const target = tiers[res.tapIndex]
          try {
            await petApi.tierDown({ targetTier: target })
            haptic.success()
            toast.success('已降阶')
            this.load()
          } catch (e) {
            toast.error(e.message || '操作失败')
          }
        }
      })
    },

    onRename() {
      uni.showModal({
        title: '改昵称',
        editable: true,
        placeholderText: '新昵称',
        success: async (res) => {
          if (!res.confirm || !res.content) return
          // rename 端点暂未提供 - 提示 TODO
          toast.text('改名功能待开放')
        }
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.pet-home {
  min-height: 100vh;
  background: $bg-page;

  &__top {
    background: linear-gradient(180deg, #FFE4D3 0%, $bg-page 100%);
    padding-bottom: $spacing-md;
    position: relative;
    overflow: hidden;
  }

  &__bg-circle {
    position: absolute;
    border-radius: 50%;
    opacity: 0.5;
    animation: float 6s ease-in-out infinite;
    pointer-events: none;

    &--1 {
      width: 280rpx;
      height: 280rpx;
      background: radial-gradient(circle, $primary-light 0%, transparent 70%);
      top: -80rpx;
      left: -60rpx;
    }
    &--2 {
      width: 220rpx;
      height: 220rpx;
      background: radial-gradient(circle, #FFD0B8 0%, transparent 70%);
      top: 40rpx;
      right: -40rpx;
      animation-delay: 1.5s;
    }
  }

  &__topbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: $spacing-md;
    position: relative;
  }

  &__title {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  &__topbar-right {
    display: flex;
    gap: $spacing-xs;
  }

  &__icon-btn {
    width: 72rpx;
    height: 72rpx;
    background: rgba(255, 255, 255, 0.7);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(8rpx);
    font-size: 36rpx;
  }

  &__body {
    padding: 0 $spacing-md;
    height: calc(100vh - 140rpx);
  }

  &__loading {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
    color: $text-secondary;
    font-size: $font-sm;
  }

  &__loading-circle {
    width: 80rpx;
    height: 80rpx;
    border: 6rpx solid $divider;
    border-top-color: $primary;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: $spacing-md;
  }

  // 引导页 (未领养/未报班)
  &__guide {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl $spacing-md;
    text-align: center;
    margin-top: $spacing-2xl;
  }

  &__guide-art {
    width: 240rpx;
    height: 240rpx;
    background: linear-gradient(135deg, $primary-lighter, $primary-light);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: $spacing-lg;
    box-shadow: 0 12rpx 32rpx rgba(255, 138, 101, 0.24);
  }

  &__guide-emoji {
    font-size: 120rpx;
    animation: float 3s ease-in-out infinite;
  }

  &__guide-title {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
    margin-bottom: $spacing-xs;
  }

  &__guide-desc {
    font-size: $font-sm;
    color: $text-secondary;
    line-height: 1.6;
    margin-bottom: $spacing-lg;
    max-width: 480rpx;
  }

  &__guide-btn {
    padding: $spacing-sm $spacing-xl;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    box-shadow: $shadow-button;
  }

  &__guide-btn > text {
    color: #fff;
    font-size: $font-base;
    font-weight: $font-weight-semibold;
  }

  // 宠物卡片
  &__pet {
    margin-top: $spacing-md;
  }

  &__egg {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-2xl;
  }

  &__egg-emoji {
    font-size: 280rpx;
    line-height: 1;
    filter: drop-shadow(0 12rpx 32rpx rgba(255, 138, 101, 0.4));
  }

  &__egg-label {
    margin-top: $spacing-md;
    font-size: $font-md;
    color: $text-secondary;
  }

  &__hatch-btn {
    margin: $spacing-lg $spacing-2xl;
    padding: $spacing-md;
    background: linear-gradient(135deg, $primary, $primary-light);
    color: #fff;
    border-radius: $radius-pill;
    text-align: center;
    box-shadow: $shadow-button;
  }

  &__hatch-btn > text {
    color: #fff;
    font-size: $font-lg;
    font-weight: $font-weight-semibold;
  }

  &__portrait-wrap {
    @include flex-center;
    margin: $spacing-md auto;
    position: relative;
    width: 320rpx;
    height: 320rpx;
    background: linear-gradient(135deg, $primary-lighter, $accent-light);
    border-radius: 50%;
    box-shadow: 0 16rpx 40rpx rgba(255, 138, 101, 0.3);
  }

  &__portrait-svg {
    width: 80%;
    height: 80%;
  }

  &__portrait-emoji {
    font-size: 200rpx;
    line-height: 1;
  }

  &__tier-badge {
    position: absolute;
    top: -8rpx;
    right: -8rpx;
    padding: 8rpx 20rpx;
    border-radius: $radius-pill;
    color: #fff;
    font-size: $font-sm;
    font-weight: $font-weight-semibold;
    box-shadow: 0 4rpx 12rpx rgba(0, 0, 0, 0.16);
  }

  &__name-row {
    @include flex-center;
    margin: $spacing-md 0 $spacing-lg;
    gap: $spacing-sm;
  }

  &__name {
    font-size: $font-2xl;
    font-weight: $font-weight-bold;
    color: $text-primary;
  }

  &__level {
    padding: 4rpx 16rpx;
    background: linear-gradient(135deg, $gold, #FFE4A1);
    color: #fff;
    border-radius: $radius-pill;
    font-size: $font-xs;
    font-weight: $font-weight-semibold;
    box-shadow: 0 2rpx 8rpx rgba(245, 193, 72, 0.32);
  }

  // 状态条
  &__stat {
    margin-bottom: $spacing-md;
  }

  &__stat-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: $spacing-xs;
  }

  &__stat-label {
    font-size: $font-sm;
    color: $text-primary;
    font-weight: $font-weight-medium;
  }

  &__stat-value {
    font-size: $font-sm;
    color: $text-secondary;
  }

  &__stat-bar {
    height: 16rpx;
    background: $divider-light;
    border-radius: 8rpx;
    overflow: hidden;
  }

  &__stat-fill {
    height: 100%;
    border-radius: 8rpx;
    transition: width $transition-base;

    &--hunger {
      background: linear-gradient(90deg, $warning 0%, $primary 70%, $accent 100%);
    }

    &--exp {
      background: linear-gradient(90deg, $gold 0%, #FFE4A1 100%);
    }
  }

  // 装备
  &__equip {
    background: $bg-card;
    border-radius: $radius-md;
    padding: $spacing-md;
    margin: $spacing-md 0;
    box-shadow: $shadow-card;
  }

  &__equip-title {
    font-size: $font-base;
    font-weight: $font-weight-semibold;
    color: $text-primary;
    margin-bottom: $spacing-sm;
  }

  &__equip-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: $spacing-sm;
  }

  &__equip-slot {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-sm $spacing-xs;
    background: $bg-page;
    border-radius: $radius-sm;
    transition: all $transition-fast;

    &--empty {
      background: $divider-light;
      opacity: 0.7;
    }

    &:active {
      transform: scale(0.96);
    }
  }

  &__equip-emoji {
    font-size: 56rpx;
    margin-bottom: 4rpx;
  }

  &__equip-empty {
    font-size: 40rpx;
    color: $text-tertiary;
    margin-bottom: 4rpx;
  }

  &__equip-name {
    font-size: $font-xs;
    color: $text-secondary;
  }

  // 操作
  &__actions {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: $spacing-sm;
    margin-top: $spacing-lg;
  }

  &__action {
    @include flex-center;
    flex-direction: column;
    padding: $spacing-sm $spacing-xs;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;

    &:active {
      transform: scale(0.95);
    }
  }

  &__action-icon {
    width: 80rpx;
    height: 80rpx;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 44rpx;
    margin-bottom: $spacing-xs;

    &--feed {
      background: $primary-lighter;
    }
    &--equip {
      background: #EDE3FA;
    }
    &--shop {
      background: #FFF1D0;
    }
    &--more {
      background: $divider-light;
    }
  }

  &__more {
    margin-top: $spacing-sm;
    background: $bg-card;
    border-radius: $radius-md;
    box-shadow: $shadow-card;
    overflow: hidden;
  }

  &__more-item {
    padding: $spacing-md;
    border-bottom: 1rpx solid $divider-light;

    &:last-child {
      border-bottom: none;
    }

    &:active {
      background: $bg-page;
    }
  }

  &__bottom-spacer {
    height: $spacing-xl;
  }
}
</style>