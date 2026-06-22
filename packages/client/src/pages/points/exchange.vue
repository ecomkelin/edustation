<template>
  <view class="page">
    <view class="banner card">
      <text class="text-16 text-strong">宠物商城</text>
      <text class="text-12 text-muted">用积分购买装饰和食物，购买后装饰放入背包（请到宠物页装备），食物立即喂一次</text>
    </view>

    <!-- 我的积分 -->
    <view class="card points-card">
      <text class="text-14 text-strong">我的积分</text>
      <text class="text-24 text-strong points-num">{{ myPoints || 0 }}</text>
    </view>

    <!-- Tab 切换 -->
    <view class="tabs">
      <view :class="['tab', { active: tab === 'item' }]" @tap="tab = 'item'">
        <text>装饰 ({{ items.length }})</text>
      </view>
      <view :class="['tab', { active: tab === 'consumable' }]" @tap="tab = 'consumable'">
        <text>食物玩具 ({{ consumables.length }})</text>
      </view>
    </view>

    <view v-if="loading" class="empty">
      <text>加载中…</text>
    </view>

    <!-- 装饰列表 -->
    <view v-else-if="tab === 'item'" class="list">
      <view
        v-for="it in items"
        :key="it.key"
        class="card shop-card"
        :class="{ 'card-disabled': it.unlocked }"
        @tap="onPickItem(it)"
      >
        <view class="row">
          <view class="icon-wrap">
            <image v-if="it.visualType === 'image' && it.imageFile" :src="it.imageFile.url" class="icon-img" mode="aspectFit" />
            <view v-else-if="it.svgContent" class="svg-wrap">
              <view class="svg-inner" v-html="it.svgContent"></view>
            </view>
            <text v-else class="emoji">🎁</text>
          </view>
          <view class="flex-1">
            <text class="text-14 text-strong">{{ it.name }}</text>
            <text class="text-12 text-muted">{{ slotLabel(it.slot) }} · {{ it.description || '装饰' }}</text>
            <text v-if="it.unlocked" class="tag-unlocked">✓ 已解锁</text>
          </view>
          <view class="price-wrap">
            <text class="cost">{{ it.pointCost }} 积分</text>
            <button
              class="btn-buy"
              :class="{ 'btn-disabled': it.unlocked }"
              :disabled="it.unlocked || (myPoints || 0) < it.pointCost"
              @tap.stop="onBuyItem(it)"
            >
              {{ it.unlocked ? '已解锁' : ((myPoints || 0) < it.pointCost ? '积分不足' : '购买') }}
            </button>
          </view>
        </view>
      </view>
    </view>

    <!-- 食物玩具列表 -->
    <view v-else class="list">
      <view
        v-for="c in consumables"
        :key="c.key"
        class="card shop-card"
        :class="{ 'card-disabled': c.priceForTier === null }"
        @tap="onPickConsumable(c)"
      >
        <view class="row">
          <view class="icon-wrap">
            <image v-if="c.visualType === 'image' && c.imageFile" :src="c.imageFile.url" class="icon-img" mode="aspectFit" />
            <view v-else-if="c.svgContent" class="svg-wrap">
              <view class="svg-inner" v-html="c.svgContent"></view>
            </view>
            <text v-else class="emoji">{{ c.kind === 'food' ? '🍖' : '🧸' }}</text>
          </view>
          <view class="flex-1">
            <text class="text-14 text-strong">{{ c.name }}</text>
            <text class="text-12 text-muted">
              {{ kindLabel(c.kind) }} · {{ tierLabel(c.applicableTier) }}
              <text v-if="c.priceForTier !== null">· +{{ c.expGain }} 经验 · +{{ c.hungerRestore }} 饱腹</text>
            </text>
            <text v-if="c.priceForTier === null" class="tag-disabled">不适用当前阶</text>
          </view>
          <view class="price-wrap">
            <text class="cost">{{ c.priceForTier ?? '—' }} 积分</text>
            <button
              class="btn-buy"
              :class="{ 'btn-disabled': c.priceForTier === null }"
              :disabled="c.priceForTier === null || (myPoints || 0) < (c.priceForTier || 0)"
              @tap.stop="onBuyConsumable(c)"
            >
              {{ c.priceForTier === null ? '不可用' : ((myPoints || 0) < c.priceForTier ? '积分不足' : '购买并喂') }}
            </button>
          </view>
        </view>
      </view>
      <view v-if="consumables.length === 0" class="empty">
        <text>当前没有可购买的食物/玩具</text>
      </view>
    </view>

    <!-- 2026-06-22: 下一阶预览（满级升阶后可买的装饰） -->
    <view v-if="nextTierPreview.length > 0" class="card next-tier-card">
      <view class="row between">
        <text class="text-14 text-strong">下一阶 ({{ nextTier }}阶) 预览</text>
        <text class="text-12 text-muted">满级升阶后解锁</text>
      </view>
      <view class="next-tier-grid">
        <view v-for="it in nextTierPreview" :key="it.key" class="next-tier-item">
          <view class="next-tier-thumb">
            <image v-if="it.visualType === 'image' && it.imageFile" :src="it.imageFile.url" mode="aspectFit" class="icon-img" />
            <view v-else-if="it.svgContent" class="svg-wrap">
              <view class="svg-inner" v-html="it.svgContent"></view>
            </view>
            <text v-else class="emoji">🎁</text>
          </view>
          <text class="text-12 text-strong">{{ it.name }}</text>
          <text class="text-12 text-muted">{{ it.pointCost }} 积分</text>
        </view>
      </view>
    </view>

    <!-- 购买确认弹窗 -->
    <view v-if="confirmDialog" class="modal-mask" @tap="confirmDialog = null">
      <view class="modal" @tap.stop>
        <text class="modal-title">确认购买</text>
        <text class="modal-desc">{{ confirmDialog.title }}</text>
        <text class="modal-desc text-muted">{{ confirmDialog.subtitle }}</text>
        <view class="modal-actions">
          <button class="btn-cancel" @tap="confirmDialog = null">取消</button>
          <button class="btn-confirm" :loading="buying" @tap="submitBuy">确认支付 {{ confirmDialog.cost }} 积分</button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { petApi } from '@/api/pet'
import { pointsApi } from '@/api/points'
import { PET_SLOT_LABELS } from '@/utils/constants'

const KIND_LABEL = { food: '食物', toy: '玩具' }
const TIER_LABEL = { C: 'C 阶', B: 'B 阶', A: 'A 阶', S: 'S 阶', all: '通用' }

export default {
  data() {
    return {
      tab: 'item',
      items: [],
      consumables: [],
      nextTier: null,
      nextTierPreview: [],
      myPoints: 0,
      loading: false,
      confirmDialog: null,
      buying: false
    }
  },
  onShow() {
    this.load()
  },
  methods: {
    async load() {
      this.loading = true
      try {
        // 拉商城（petAccountId + tier 由后端按当前 active student 推）
        const shopRes = await petApi.shopList()
        const data = shopRes.data || {}
        this.items = data.items || []
        this.consumables = data.consumables || []
        // 2026-06-22: 下一阶预览
        this.nextTier = data.nextTier || null
        this.nextTierPreview = data.nextTierPreview || []

        // 拉积分余额
        try {
          const ptsRes = await pointsApi.me()
          this.myPoints = ptsRes.data?.balance ?? ptsRes.data?.data?.balance ?? 0
        } catch (e) {
          this.myPoints = 0
        }
      } catch (e) {
        uni.showToast({ title: e?.message || '加载失败', icon: 'none' })
      } finally {
        this.loading = false
      }
    },
    onPickItem(it) {
      if (it.unlocked) {
        return uni.showToast({ title: '已解锁，请到宠物页装备', icon: 'none' })
      }
      this.confirmDialog = {
        kind: 'item',
        key: it.key,
        slot: it.slot,
        title: `购买装饰：${it.name}`,
        subtitle: '购买后放入背包，可选立即装备',
        cost: it.pointCost
      }
    },
    onPickConsumable(c) {
      if (c.priceForTier === null) {
        return uni.showToast({ title: '当前阶不适用', icon: 'none' })
      }
      this.confirmDialog = {
        kind: 'consumable',
        key: c.key,
        title: `购买并喂食：${c.name}`,
        subtitle: `+${c.expGain} 经验 / +${c.hungerRestore} 饱腹度，立即生效`,
        cost: c.priceForTier
      }
    },
    async submitBuy() {
      if (!this.confirmDialog) return
      this.buying = true
      const d = this.confirmDialog
      try {
        if (d.kind === 'item') {
          await petApi.buyItem(d.key)
          uni.showToast({ title: '已购买', icon: 'success' })
          this.confirmDialog = null
          await this.load()
          // B3: 弹「立即装备 / 稍后」选择
          this.askEquip(d)
        } else {
          await petApi.buyConsumable(d.key)
          uni.showToast({ title: '已喂食，宠物成长啦', icon: 'success' })
          this.confirmDialog = null
          await this.load()
        }
      } catch (e) {
        uni.showToast({ title: e?.response?.data?.message || e?.message || '购买失败', icon: 'none' })
      } finally {
        this.buying = false
      }
    },
    async askEquip(d) {
      // uni-app 的 showModal 替代 ElMessageBox
      const res = await new Promise((resolve) => {
        uni.showModal({
          title: '购买成功',
          content: '装饰已买，是否立即装备到宠物？',
          confirmText: '立即装备',
          cancelText: '稍后',
          success: (r) => resolve(r.confirm)
        })
      })
      if (!res) return
      try {
        await petApi.equip(d.slot, d.key)
        uni.showToast({ title: '已装备', icon: 'success' })
      } catch (e) {
        uni.showToast({ title: e?.response?.data?.message || '装备失败', icon: 'none' })
      }
    },
    slotLabel(s) { return PET_SLOT_LABELS[s] || s },
    kindLabel(k) { return KIND_LABEL[k] || k },
    tierLabel(t) { return TIER_LABEL[t] || t }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 160rpx; }
.banner {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  background: linear-gradient(135deg, #fff7e6 0%, #ffe7ba 100%);
  border: none;
}
.points-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: linear-gradient(135deg, #f6ffed 0%, #d9f7be 100%);
  border: none;
  margin-top: 16rpx;
  .points-num { color: #f5222d; }
}
.tabs {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
  border-bottom: 2rpx solid #ebeef5;
  padding-bottom: 16rpx;
  .tab {
    padding: 12rpx 24rpx;
    border-radius: 8rpx;
    background: #f5f7fa;
    color: #606266;
    font-size: 28rpx;
    &.active { background: #409eff; color: #fff; }
  }
}
.list { margin-top: 16rpx; display: flex; flex-direction: column; gap: 16rpx; }
.shop-card { transition: opacity 0.2s; }
.card-disabled { opacity: 0.55; }
.row { display: flex; align-items: center; gap: 16rpx; }
.emoji { font-size: 56rpx; }
.icon-wrap {
  width: 96rpx; height: 96rpx;
  display: flex; align-items: center; justify-content: center;
  background: #f5f7fa; border-radius: 12rpx;
  overflow: hidden;
  .icon-img { width: 80rpx; height: 80rpx; }
  .svg-wrap { width: 80rpx; height: 80rpx; }
  .svg-inner ::v-deep svg { width: 100%; height: 100%; }
}
.cost { color: #f5222d; font-weight: 600; font-size: 28rpx; }
.price-wrap { display: flex; flex-direction: column; align-items: flex-end; gap: 8rpx; }
.btn-buy {
  font-size: 24rpx;
  padding: 8rpx 24rpx;
  background: #409eff; color: #fff;
  border-radius: 8rpx;
  border: none;
  &::after { border: none; }
}
.btn-disabled { background: #c0c4cc !important; color: #fff !important; }
.tag-unlocked {
  display: inline-block;
  margin-top: 4rpx;
  padding: 2rpx 12rpx;
  background: #67c23a;
  color: #fff;
  font-size: 20rpx;
  border-radius: 8rpx;
}
.tag-disabled {
  display: inline-block;
  margin-top: 4rpx;
  padding: 2rpx 12rpx;
  background: #909399;
  color: #fff;
  font-size: 20rpx;
  border-radius: 8rpx;
}
.empty { padding: 80rpx 0; text-align: center; color: #909399; }

.modal-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 999;
}
.modal {
  width: 80vw;
  background: #fff;
  border-radius: 16rpx;
  padding: 32rpx;
  display: flex; flex-direction: column; gap: 16rpx;
  .modal-title { font-size: 32rpx; font-weight: 600; }
  .modal-desc { font-size: 28rpx; }
  .text-muted { color: #909399; font-size: 24rpx; }
  .modal-actions { display: flex; gap: 16rpx; margin-top: 16rpx;
    button { flex: 1; padding: 16rpx; border-radius: 8rpx; border: none;
      &::after { border: none; }
    }
    .btn-cancel { background: #f5f7fa; color: #606266; }
    .btn-confirm { background: #f5222d; color: #fff; }
  }
}
</style>