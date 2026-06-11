<template>
  <view class="page">
    <active-student-header />

    <view class="hero card">
      <view class="bg-deco" />
      <view class="pet-emoji">{{ emoji }}</view>
      <text class="pet-name">{{ pet ? pet.nickname || nameByType : '领养一只宠物吧' }}</text>
      <text v-if="pet" class="level">Lv.{{ pet.level }} · 经验 {{ pet.experience }}</text>
      <text v-else class="level text-muted">完成报名、上课、分享即可获得经验</text>
    </view>

    <view class="balance card">
      <view class="balance-item">
        <text class="num">{{ points.balance || 0 }}</text>
        <text class="label">可用积分</text>
      </view>
      <view class="divider-vertical" />
      <view class="balance-item" @tap="go('/pages/points/transaction')">
        <text class="num">›</text>
        <text class="label">积分流水</text>
      </view>
    </view>

    <view class="actions">
      <view class="action-card" @tap="feed('normal')">
        <text class="action-emoji">🥫</text>
        <text class="action-name">普通喂食</text>
        <text class="action-cost">-10 积分</text>
      </view>
      <view class="action-card" @tap="feed('premium')">
        <text class="action-emoji">🍖</text>
        <text class="action-name">高级喂食</text>
        <text class="action-cost">-30 积分</text>
      </view>
      <view class="action-card" @tap="feed('super')">
        <text class="action-emoji">🌟</text>
        <text class="action-name">特级喂食</text>
        <text class="action-cost">-80 积分</text>
      </view>
    </view>

    <view class="card" v-if="pet">
      <text class="text-16 text-strong">宠物信息</text>
      <view class="divider" />
      <view class="info-row">
        <text class="text-12 text-muted">种类</text>
        <text class="text-14">{{ nameByType }}</text>
      </view>
      <view class="info-row">
        <text class="text-12 text-muted">等级</text>
        <text class="text-14">Lv.{{ pet.level }}</text>
      </view>
      <view class="info-row">
        <text class="text-12 text-muted">经验</text>
        <text class="text-14">{{ pet.experience }} / {{ expToNextLevel }}</text>
      </view>
    </view>
  </view>
</template>

<script>
import ActiveStudentHeader from '@/components/active-student-header.vue'
import { usePetStore } from '@/stores/pet'
import { usePointsStore } from '@/stores/points'
import { mapState } from 'pinia'
import { PetEmoji, PetTypeLabel } from '@/utils/constants'

const COST = { normal: 10, premium: 30, super: 80 }
const EXP_GAIN = { normal: 10, premium: 35, super: 100 }

export default {
  components: { ActiveStudentHeader },
  data() {
    return { loading: false }
  },
  computed: {
    ...mapState(usePetStore, ['pet']),
    ...mapState(usePointsStore, ['balance']),
    emoji() {
      return PetEmoji[this.pet?.petType] || '🐾'
    },
    nameByType() {
      return PetTypeLabel[this.pet?.petType] || '小宠物'
    },
    expToNextLevel() {
      // 简单线性：lv * 100
      return (this.pet?.level || 1) * 100
    }
  },
  onShow() {
    this.refresh()
  },
  methods: {
    go(url) { uni.navigateTo({ url }) },
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
    async feed(foodType) {
      if (!this.pet) {
        return uni.showToast({ title: '暂无可喂养宠物', icon: 'none' })
      }
      const cost = COST[foodType] || 0
      if ((this.balance || 0) < cost) {
        return uni.showToast({ title: '积分不足', icon: 'none' })
      }
      try {
        const pet = usePetStore()
        await pet.feed(foodType)
        const pts = usePointsStore()
        await pts.fetchMe()
        uni.showToast({ title: `+${EXP_GAIN[foodType]} 经验`, icon: 'success' })
      } catch (_) {
        // request.js 已 toast
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 160rpx; }
.hero {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12rpx;
  padding: 48rpx 24rpx;
  background: linear-gradient(135deg, #FFE9C7 0%, #FFD4A3 100%);
  overflow: hidden;
  .bg-deco {
    position: absolute;
    top: -100rpx;
    right: -100rpx;
    width: 300rpx;
    height: 300rpx;
    background: rgba(255, 255, 255, 0.4);
    border-radius: 50%;
  }
  .pet-emoji { font-size: 160rpx; line-height: 1; }
  .pet-name { font-size: 40rpx; font-weight: 700; color: #663C00; }
  .level { font-size: 24rpx; color: #8B5A00; }
}
.balance {
  display: flex;
  align-items: center;
  padding: 24rpx;
  .balance-item {
    flex: 1;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 4rpx;
    .num { font-size: 48rpx; font-weight: 700; color: #5B8FF9; }
    .label { font-size: 24rpx; color: #6b7280; }
  }
  .divider-vertical {
    width: 1rpx;
    height: 60rpx;
    background: #e5e7eb;
  }
}
.actions {
  display: flex;
  gap: 16rpx;
  margin-bottom: 16rpx;
  .action-card {
    flex: 1;
    background: #ffffff;
    border-radius: 16rpx;
    padding: 24rpx 8rpx;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8rpx;
    .action-emoji { font-size: 64rpx; }
    .action-name { font-size: 28rpx; font-weight: 600; }
    .action-cost { font-size: 22rpx; color: #f5222d; }
  }
}
.info-row {
  display: flex;
  justify-content: space-between;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-child { border-bottom: none; }
}
</style>
