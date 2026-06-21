<template>
  <view class="page">
    <active-student-header />

    <!-- 蛋态 -->
    <view v-if="isEgg" class="state-card egg-card">
      <view class="egg-emoji">🥚</view>
      <text class="state-title">{{ eggTierLabel }} 蛋</text>
      <text class="state-subtitle">破壳后将随机获得一只{{ eggTierLabel }}宠物</text>
      <view class="hatch-btn-wrap">
        <button class="primary-btn" :loading="loading" @tap="onHatch">破壳</button>
      </view>
    </view>

    <!-- 活态 -->
    <view v-else-if="isAlive" class="alive-wrap">
      <view class="state-card alive-card">
        <view class="pet-image" :class="`bg-${pet?.equipped?.background || 'none'}`">
          <text class="pet-emoji">{{ speciesEmoji }}</text>
          <view v-if="halo" class="halo">{{ haloEmoji }}</view>
        </view>
        <view class="pet-info">
          <text class="pet-name">{{ pet?.nickname || speciesRecord?.name || '小宠物' }}</text>
          <view class="tier-badge" :class="`tier-${tier}`">{{ tierLabel }} · Lv.{{ level }}</view>
        </view>
        <view class="bars">
          <view class="bar-row">
            <text class="bar-label">经验</text>
            <view class="bar"><view class="bar-fill exp-bar" :style="{ width: expPercent + '%' }" /></view>
            <text class="bar-text">{{ exp }} / {{ nextExpToLevel || tierUpThreshold }}</text>
          </view>
          <view class="bar-row">
            <text class="bar-label">饱腹</text>
            <view class="bar"><view class="bar-fill hunger-bar" :style="{ width: hunger + '%' }" /></view>
            <text class="bar-text">{{ hunger }} / 100</text>
          </view>
        </view>
      </view>

      <!-- 喂食 -->
      <view class="section">
        <text class="section-title">喂食</text>
        <view class="action-row">
          <view v-for="ft in foodTypes" :key="ft.key"
                class="action-card" @tap="onFeed(ft.key)">
            <text class="action-emoji">{{ ft.emoji }}</text>
            <text class="action-name">{{ ft.label }}</text>
            <text class="action-cost">-{{ costFor(ft.key) }} 积分</text>
            <text class="action-gain">+{{ rewardFor(ft.key).exp }} 经验</text>
          </view>
        </view>
      </view>

      <!-- 操作 -->
      <view class="section">
        <text class="section-title">操作</text>
        <view class="ops-row">
          <view class="op-btn" @tap="goEquip">
            <text class="op-emoji">🎨</text>
            <text class="op-label">换装</text>
          </view>
          <view class="op-btn" @tap="onSwap">
            <text class="op-emoji">🥚</text>
            <text class="op-label">换一只</text>
            <text class="op-cost">-{{ swapCost }} 积分</text>
          </view>
          <view v-if="canTierDown" class="op-btn" @tap="onTierDownShow = true">
            <text class="op-emoji">⬇️</text>
            <text class="op-label">降阶</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 降阶弹窗 -->
    <view v-if="onTierDownShow" class="modal-mask" @tap="onTierDownShow = false">
      <view class="modal" @tap.stop>
        <text class="modal-title">主动降阶</text>
        <text class="modal-subtitle">降阶后装饰保留，已装备的高阶装饰将自动卸下</text>
        <view class="tier-options">
          <view v-for="t in pet?.possibleTierDowns || []" :key="t"
                class="tier-opt" @tap="onTierDownConfirm(t)">
            {{ tierLabelOf(t) }}
          </view>
        </view>
        <button class="secondary-btn" @tap="onTierDownShow = false">取消</button>
      </view>
    </view>
  </view>
</template>

<script>
import ActiveStudentHeader from '@/components/active-student-header.vue'
import { usePetStore } from '@/stores/pet'
import { usePointsStore } from '@/stores/points'
import { mapState } from 'pinia'
import { PET_TIER_LABELS, FOOD_TYPE_LABELS } from '@/utils/constants'

const FOOD_EMOJI = { normal: '🥫', premium: '🍖', super: '🌟' }
const FOOD_TYPES = [
  { key: 'normal', label: '普通' },
  { key: 'premium', label: '高级' },
  { key: 'super', label: '特级' }
]
const HALO_EMOJI = { halo_basic: '✨', halo_sparkle: '⭐', halo_glow: '💫', halo_rainbow: '🌈', halo_divine: '👑', halo_solar: '☀️' }
const SPECIES_EMOJI = {
  cat_orange: '🐱', dog_puppy: '🐶', rabbit_white: '🐰', hamster_gold: '🐹',
  fox_red: '🦊', panda_baby: '🐼', penguin_baby: '🐧', owl_horned: '🦉',
  wolf_arctic: '🐺', deer_white: '🦌', hawk_red: '🦅', dolphin_blue: '🐬',
  dragon_emperor: '🐉', phoenix_fire: '🔥', unicorn_rainbow: '🦄', griffin_gold: '🦅'
}

export default {
  components: { ActiveStudentHeader },
  data() {
    return { loading: false, onTierDownShow: false }
  },
  computed: {
    ...mapState(usePetStore, ['pet']),
    ...mapState(usePointsStore, ['balance']),
    isEgg() { return this.pet?.state === 'egg' },
    isAlive() { return this.pet?.state === 'alive' },
    tier() { return this.pet?.tier },
    level() { return this.pet?.level },
    exp() { return this.pet?.experience },
    nextExpToLevel() { return this.pet?.nextExpToLevel },
    tierUpThreshold() { return this.pet?.tierUpThreshold },
    hunger() { return this.pet?.currentHunger },
    speciesRecord() { return this.pet?.speciesRecord },
    speciesEmoji() {
      return SPECIES_EMOJI[this.pet?.species] || this.speciesRecord?.name?.[0] || '🐾'
    },
    tierLabel() { return PET_TIER_LABELS[this.tier] || '' },
    eggTierLabel() { return PET_TIER_LABELS[this.pet?.eggTier] || 'C 级' },
    foodTypes() { return FOOD_TYPES },
    costFor(key) { return this.pet?.currentFoodCost?.[key] ?? 0 },
    rewardFor(key) {
      // 服务端不返回，客户端按需通过 pet.feed 反馈展示
      return { exp: '?' }
    },
    swapCost() { return this.pet?.currentSwapCost || 0 },
    canTierDown() { return (this.pet?.possibleTierDowns || []).length > 0 },
    halo() { return this.pet?.equipped?.halo },
    haloEmoji() { return HALO_EMOJI[this.halo] || '' },
    expPercent() {
      if (!this.nextExpToLevel) return 0
      return Math.min(100, (this.exp / this.nextExpToLevel) * 100)
    }
  },
  onShow() {
    this.refresh()
  },
  methods: {
    tierLabelOf(t) { return PET_TIER_LABELS[t] || t },
    goEquip() { uni.navigateTo({ url: '/pages/pet/equip' }) },
    async refresh() {
      this.loading = true
      try {
        const pet = usePetStore()
        await pet.fetchMe()
        const pts = usePointsStore()
        await pts.fetchMe()
      } catch (_) {} finally {
        this.loading = false
      }
    },
    async onHatch() {
      try {
        const pet = usePetStore()
        this.loading = true
        await pet.hatch()
        uni.showToast({ title: '破壳成功！', icon: 'success' })
      } catch (e) {
        // 错误已由 request.js toast
      } finally {
        this.loading = false
      }
    },
    async onFeed(foodType) {
      if ((this.balance || 0) < this.costFor(foodType)) {
        return uni.showToast({ title: '积分不足', icon: 'none' })
      }
      try {
        const pet = usePetStore()
        const r = await pet.feed(foodType)
        if (r?.tierUp) {
          uni.showToast({ title: '升阶了！', icon: 'success' })
        } else if (r?.levelUp) {
          uni.showToast({ title: '升级了！', icon: 'success' })
        } else {
          uni.showToast({ title: '喂食成功', icon: 'success' })
        }
        const pts = usePointsStore()
        await pts.fetchMe()
      } catch (_) {}
    },
    async onSwap() {
      if ((this.balance || 0) < this.swapCost) {
        return uni.showToast({ title: '积分不足', icon: 'none' })
      }
      try {
        const pet = usePetStore()
        this.loading = true
        await pet.swapEgg()
        uni.showToast({ title: '已置换为新蛋', icon: 'success' })
        const pts = usePointsStore()
        await pts.fetchMe()
      } catch (e) {} finally {
        this.loading = false
      }
    },
    async onTierDownConfirm(targetTier) {
      this.onTierDownShow = false
      try {
        const pet = usePetStore()
        this.loading = true
        await pet.tierDown(targetTier)
        uni.showToast({ title: '已降阶为蛋', icon: 'success' })
      } catch (e) {} finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 160rpx; }
.state-card {
  padding: 48rpx 24rpx;
  border-radius: 24rpx;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16rpx;
}
.egg-card {
  background: linear-gradient(135deg, #FFE9C7 0%, #FFD4A3 100%);
  margin-top: 24rpx;
}
.egg-emoji { font-size: 200rpx; line-height: 1; }
.state-title { font-size: 36rpx; font-weight: 700; color: #663C00; }
.state-subtitle { font-size: 26rpx; color: #8B5A00; }
.hatch-btn-wrap { margin-top: 16rpx; }
.primary-btn {
  background: #f5222d;
  color: #fff;
  font-size: 32rpx;
  padding: 16rpx 64rpx;
  border-radius: 48rpx;
}
.alive-card { background: linear-gradient(135deg, #E3F2FD 0%, #BBDEFB 100%); position: relative; }
.pet-image {
  position: relative;
  width: 200rpx;
  height: 200rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.6);
  border-radius: 50%;
}
.pet-emoji { font-size: 120rpx; }
.halo {
  position: absolute;
  top: -10rpx;
  right: -10rpx;
  font-size: 60rpx;
  animation: spin 4s linear infinite;
}
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.pet-info { display: flex; flex-direction: column; align-items: center; gap: 8rpx; }
.pet-name { font-size: 36rpx; font-weight: 700; color: #1A237E; }
.tier-badge {
  padding: 4rpx 16rpx;
  border-radius: 16rpx;
  font-size: 22rpx;
  color: #fff;
  &.tier-C { background: #9E9E9E; }
  &.tier-B { background: #2196F3; }
  &.tier-A { background: #9C27B0; }
  &.tier-S { background: #FF6D00; }
}
.bars { width: 100%; display: flex; flex-direction: column; gap: 12rpx; margin-top: 8rpx; }
.bar-row { display: flex; align-items: center; gap: 12rpx; }
.bar-label { font-size: 24rpx; color: #666; min-width: 80rpx; }
.bar { flex: 1; height: 16rpx; background: rgba(255,255,255,0.5); border-radius: 8rpx; overflow: hidden; }
.bar-fill { height: 100%; transition: width 0.3s; }
.exp-bar { background: #4CAF50; }
.hunger-bar { background: #FF9800; }
.bar-text { font-size: 22rpx; color: #666; min-width: 120rpx; text-align: right; }

.section { margin-top: 32rpx; }
.section-title { font-size: 28rpx; font-weight: 600; color: #333; margin-bottom: 12rpx; display: block; }
.action-row { display: flex; gap: 16rpx; }
.action-card {
  flex: 1;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 8rpx;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.action-emoji { font-size: 56rpx; }
.action-name { font-size: 26rpx; font-weight: 600; }
.action-cost { font-size: 22rpx; color: #f5222d; }
.action-gain { font-size: 20rpx; color: #4CAF50; }
.ops-row { display: flex; gap: 16rpx; }
.op-btn {
  flex: 1;
  background: #fff;
  border-radius: 16rpx;
  padding: 24rpx 8rpx;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}
.op-emoji { font-size: 56rpx; }
.op-label { font-size: 26rpx; font-weight: 600; }
.op-cost { font-size: 20rpx; color: #999; }

.modal-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
}
.modal {
  width: 80%; background: #fff; border-radius: 24rpx; padding: 32rpx;
  display: flex; flex-direction: column; gap: 16rpx;
}
.modal-title { font-size: 32rpx; font-weight: 700; text-align: center; }
.modal-subtitle { font-size: 24rpx; color: #666; text-align: center; }
.tier-options { display: flex; flex-wrap: wrap; gap: 12rpx; justify-content: center; }
.tier-opt {
  padding: 12rpx 24rpx;
  background: #f0f0f0;
  border-radius: 16rpx;
  font-size: 28rpx;
}
.secondary-btn {
  background: #f0f0f0; color: #333;
  font-size: 28rpx; padding: 12rpx; border-radius: 16rpx;
}
</style>
