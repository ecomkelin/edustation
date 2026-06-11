<template>
  <view class="page">
    <view class="banner card">
      <text class="text-16 text-strong">积分商城</text>
      <text class="text-12 text-muted">阶段 3 商用强化将上线更多权益与实物兑换</text>
    </view>

    <view class="card" v-for="g in goods" :key="g.id" @tap="onPick(g)">
      <view class="row">
        <text class="emoji">{{ g.emoji }}</text>
        <view class="flex-1">
          <text class="text-14 text-strong">{{ g.name }}</text>
          <text class="text-12 text-muted">{{ g.desc }}</text>
        </view>
        <text class="cost">{{ g.cost }} 积分</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      goods: [
        { id: 'feed-1', name: '普通喂食 1 次', desc: '为宠物增加 10 经验', cost: 10, emoji: '🥫' },
        { id: 'feed-2', name: '高级喂食 1 次', desc: '为宠物增加 35 经验', cost: 30, emoji: '🍖' },
        { id: 'lottery', name: '抽奖一次', desc: '有机会抽中赠课课时（阶段 3）', cost: 50, emoji: '🎰' },
        { id: 'course-discount', name: '报名优惠 5%', desc: '下次下单可使用（阶段 3）', cost: 100, emoji: '🎟️' }
      ]
    }
  },
  methods: {
    onPick(g) {
      uni.showToast({ title: '兑换功能开发中', icon: 'none' })
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.banner {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  background: linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%);
  border: none;
}
.row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  .emoji { font-size: 56rpx; }
  .cost { color: #f5222d; font-weight: 600; }
}
</style>
