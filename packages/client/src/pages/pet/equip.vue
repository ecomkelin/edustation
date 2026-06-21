<template>
  <view class="page">
    <view class="header">
      <view class="back-btn" @tap="goBack">‹</view>
      <text class="title">换装</text>
    </view>

    <view v-if="pet" class="preview">
      <view class="preview-image" :class="`bg-${pet.equipped?.background || 'none'}`">
        <text class="preview-emoji">{{ speciesEmoji }}</text>
        <text v-if="pet.equipped?.halo" class="preview-halo">{{ haloEmoji }}</text>
      </view>
    </view>

    <view v-for="slot in slots" :key="slot" class="slot-section">
      <text class="slot-title">{{ slotLabels[slot] }}</text>
      <scroll-view class="slot-scroll" scroll-x>
        <view class="items-row">
          <view
            v-for="item in itemsBySlot[slot] || []"
            :key="item.key"
            class="item-card"
            :class="{ equipped: pet?.equipped?.[slot] === item.key, locked: !item.unlocked }"
            @tap="onEquipClick(slot, item)"
          >
            <text class="item-emoji">{{ itemEmoji(item.type) }}</text>
            <text class="item-name">{{ item.name }}</text>
            <text v-if="item.equipped" class="item-tag equipped-tag">已装备</text>
            <text v-else-if="item.unlocked" class="item-tag unlocked-tag">可装备</text>
            <text v-else class="item-tag locked-tag">🔒</text>
          </view>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script>
import { usePetStore } from '@/stores/pet'
import { PET_SLOT_LABELS, PET_SPECIES_EMOJI } from '@/utils/constants'

const SLOT_EMOJI = {
  hat: '🎩', scarf: '🧣', clothes: '👕', accessory: '💎', halo: '✨', background: '🌄'
}
const HALO_EMOJI = {
  halo_basic: '✨', halo_sparkle: '⭐', halo_glow: '💫',
  halo_rainbow: '🌈', halo_divine: '👑', halo_solar: '☀️'
}

export default {
  data() {
    return {
      slots: ['hat', 'scarf', 'clothes', 'accessory', 'halo', 'background'],
      slotLabels: PET_SLOT_LABELS
    }
  },
  computed: {
    pet() { return usePetStore().pet },
    itemsBySlot() {
      return usePetStore().itemsCatalog?.items || {}
    },
    speciesEmoji() {
      const sp = this.pet?.species
      return PET_SPECIES_EMOJI[sp] || '🐾'
    },
    haloEmoji() {
      return HALO_EMOJI[this.pet?.equipped?.halo] || ''
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    itemEmoji(type) { return SLOT_EMOJI[type] || '❓' },
    goBack() { uni.navigateBack() },
    async load() {
      const pet = usePetStore()
      await pet.fetchMe()
      await pet.fetchItems()
    },
    async onEquipClick(slot, item) {
      if (!item.unlocked) {
        return uni.showToast({ title: '尚未解锁', icon: 'none' })
      }
      const pet = usePetStore()
      const isEquipped = this.pet?.equipped?.[slot] === item.key
      try {
        // 已装备则卸下；未装备则装备
        await pet.equip(slot, isEquipped ? null : item.key)
        uni.showToast({ title: isEquipped ? '已卸下' : '已装备', icon: 'success' })
      } catch (e) {}
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 160rpx; }
.header { display: flex; align-items: center; gap: 16rpx; margin-bottom: 24rpx; }
.back-btn {
  width: 64rpx; height: 64rpx;
  background: #f0f0f0;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 40rpx;
}
.title { font-size: 32rpx; font-weight: 700; }
.preview {
  display: flex; justify-content: center; margin-bottom: 32rpx;
}
.preview-image {
  position: relative;
  width: 240rpx; height: 240rpx;
  background: rgba(255,255,255,0.8);
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
}
.preview-emoji { font-size: 140rpx; }
.preview-halo { position: absolute; top: -10rpx; right: -10rpx; font-size: 70rpx; }
.slot-section { margin-bottom: 24rpx; }
.slot-title { font-size: 28rpx; font-weight: 600; margin-bottom: 12rpx; display: block; }
.slot-scroll { white-space: nowrap; }
.items-row { display: inline-flex; gap: 16rpx; padding: 0 8rpx; }
.item-card {
  width: 160rpx;
  background: #fff;
  border-radius: 16rpx;
  padding: 16rpx 8rpx;
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 6rpx;
  border: 4rpx solid transparent;
  &.equipped { border-color: #4CAF50; background: #E8F5E9; }
  &.locked { opacity: 0.5; }
}
.item-emoji { font-size: 56rpx; }
.item-name { font-size: 22rpx; font-weight: 500; }
.item-tag { font-size: 18rpx; padding: 2rpx 8rpx; border-radius: 8rpx; }
.equipped-tag { background: #4CAF50; color: #fff; }
.unlocked-tag { background: #E3F2FD; color: #1976D2; }
.locked-tag { background: #f0f0f0; color: #999; }
</style>
