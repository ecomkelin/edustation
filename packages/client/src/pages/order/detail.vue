<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!data" class="empty-state">订单不存在</view>
    <view v-else>
      <view class="status card">
        <text :class="statusClass(data.status)" class="status-text">{{ statusLabel(data.status) }}</text>
        <text v-if="data.paidAt" class="text-12 text-muted">支付时间：{{ formatDateTime(data.paidAt) }}</text>
      </view>

      <view class="card">
        <text class="text-16 text-strong">订单信息</text>
        <view class="divider" />
        <view class="row"><text class="text-12 text-muted">订单号</text><text class="text-12">{{ data.id }}</text></view>
        <view class="row"><text class="text-12 text-muted">下单时间</text><text class="text-12">{{ formatDateTime(data.createdAt) }}</text></view>
        <view class="row"><text class="text-12 text-muted">学员</text><text class="text-12">{{ data.student?.name || '-' }}</text></view>
        <view v-if="data.paymentMethod" class="row"><text class="text-12 text-muted">支付方式</text><text class="text-12">{{ paymentLabel(data.paymentMethod) }}</text></view>
        <view v-if="data.remark" class="row"><text class="text-12 text-muted">备注</text><text class="text-12">{{ data.remark }}</text></view>
      </view>

      <view class="card">
        <text class="text-16 text-strong">课程明细</text>
        <view class="divider" />
        <view v-for="(it, i) in data.items" :key="i" class="item">
          <view class="flex-1">
            <text class="text-14 text-strong">{{ it.name }}</text>
            <text class="text-12 text-muted">单价 {{ formatMoney(it.unitPrice) }}</text>
          </view>
          <text class="text-14">x{{ it.quantity || 1 }}</text>
        </view>
        <view class="divider" />
        <view class="row"><text class="text-12 text-muted">原价</text><text class="text-12">{{ formatMoney(data.originalPrice) }}</text></view>
        <view class="row" v-if="data.actualPrice !== data.originalPrice">
          <text class="text-12 text-muted">实付</text>
          <text class="text-14 text-strong">{{ formatMoney(data.actualPrice) }}</text>
        </view>
        <view class="row" v-if="data.paidAmount">
          <text class="text-12 text-muted">已支付</text>
          <text class="text-14 text-strong">{{ formatMoney(data.paidAmount) }}</text>
        </view>
      </view>

      <view v-if="data.status === 'pending'" class="actions">
        <button class="btn-secondary" @tap="onCancel">取消订单</button>
        <button class="btn-primary" @tap="onPay">立即支付</button>
      </view>
    </view>
  </view>
</template>

<script>
import { orderApi } from '@/api/order'
import { formatDateTime, formatMoney } from '@/utils/format'
import { OrderStatusLabel, PaymentMethodLabel } from '@/utils/constants'

export default {
  data() {
    return { id: '', data: null, loading: true }
  },
  onLoad(query) {
    this.id = query.id
    this.load()
  },
  methods: {
    formatDateTime, formatMoney,
    statusLabel(s) { return OrderStatusLabel[s] || '' },
    statusClass(s) {
      if (s === 'paid') return 'tag tag-success'
      if (s === 'cancelled' || s === 'refunded') return 'tag tag-warn'
      return 'tag'
    },
    paymentLabel(m) { return PaymentMethodLabel[m] || m },
    async load() {
      this.loading = true
      try {
        const res = await orderApi.detail(this.id)
        this.data = res.data
      } catch (_) {
        this.data = null
      } finally {
        this.loading = false
      }
    },
    async onCancel() {
      const r = await uni.showModal({ title: '确认取消订单？' })
      if (!r.confirm) return
      try {
        await orderApi.cancel(this.id, { reason: '家长主动取消' })
        uni.showToast({ title: '已取消', icon: 'success' })
        this.load()
      } catch (_) {}
    },
    async onPay() {
      // 阶段 2 stub：默认用微信支付 + 全额
      try {
        await orderApi.pay(this.id, { paymentMethod: 'wechat', paidAmount: this.data.actualPrice })
        uni.showToast({ title: '支付成功', icon: 'success' })
        this.load()
      } catch (_) {}
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.status {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8rpx;
  padding: 32rpx;
  .status-text { font-size: 40rpx; font-weight: 600; }
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
}
.item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 12rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-child { border-bottom: none; }
}
.actions {
  display: flex;
  gap: 16rpx;
  margin-top: 24rpx;
  button { flex: 1; }
}
</style>
