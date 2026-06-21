<template>
  <view class="page">
    <view class="hatch-scene">
      <view class="egg-bounce" :class="{ cracking: cracking }">🥚</view>
      <view v-if="phase === 'reveal'" class="reveal">
        <text class="reveal-emoji">{{ speciesEmoji }}</text>
        <text class="reveal-name">{{ speciesName }}</text>
        <text class="reveal-tier">{{ tierLabel }}</text>
      </view>
    </view>
    <view v-if="phase === 'ready'" class="action-area">
      <button class="primary-btn" @tap="onCrack">破壳！</button>
    </view>
    <view v-else-if="phase === 'cracking'" class="action-area">
      <text class="hint">破壳中...</text>
    </view>
    <view v-else-if="phase === 'reveal'" class="action-area">
      <button class="primary-btn" @tap="goHome">收下宠物</button>
    </view>
  </view>
</template>

<script>
import { usePetStore } from '@/stores/pet'
import { PET_TIER_LABELS, PET_SPECIES_EMOJI } from '@/utils/constants'

export default {
  data() {
    return { phase: 'ready', cracking: false, speciesName: '', speciesEmoji: '🐾', tierLabel: '' }
  },
  methods: {
    onCrack() {
      this.phase = 'cracking'
      this.cracking = true
      setTimeout(async () => {
        try {
          const pet = usePetStore()
          const r = await pet.hatch()
          this.speciesName = r?.speciesRecord?.name || r?.species || '小宠物'
          this.speciesEmoji = PET_SPECIES_EMOJI[r?.species] || '🐾'
          this.tierLabel = PET_TIER_LABELS[r?.tier] || ''
          this.phase = 'reveal'
        } catch (e) {
          this.phase = 'ready'
          this.cracking = false
        }
      }, 1200)
    },
    goHome() { uni.reLaunch({ url: '/pages/tabbar/pet' }) }
  }
}
</script>

<style lang="scss" scoped>
.page {
  height: 100vh;
  background: linear-gradient(135deg, #FFE9C7 0%, #FFD4A3 100%);
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 48rpx;
}
.hatch-scene {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 32rpx;
}
.egg-bounce {
  font-size: 240rpx; line-height: 1;
  animation: bounce 1.2s ease-in-out infinite;
  &.cracking { animation: shake 0.4s linear infinite; }
}
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-30rpx); }
}
@keyframes shake {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  75% { transform: rotate(10deg); }
}
.reveal { display: flex; flex-direction: column; align-items: center; gap: 16rpx; }
.reveal-emoji { font-size: 200rpx; }
.reveal-name { font-size: 48rpx; font-weight: 700; color: #663C00; }
.reveal-tier { font-size: 32rpx; color: #8B5A00; }
.action-area { padding: 48rpx 0; }
.primary-btn {
  background: #f5222d; color: #fff;
  font-size: 36rpx;
  padding: 24rpx 96rpx;
  border-radius: 48rpx;
}
.hint { font-size: 32rpx; color: #8B5A00; }
</style>
