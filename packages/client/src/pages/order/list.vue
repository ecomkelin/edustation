<template>
  <view class="page">
    <view class="tabs">
      <view
        v-for="t in tabs"
        :key="t.value"
        class="tab"
        :class="{ active: current === t.value }"
        @tap="current = t.value; load()"
      >{{ t.label }}</view>
    </view>

    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!list.length" class="empty-state">暂无订单</view>
    <view v-else>
      <view v-for="o in list" :key="o.id" class="card" @tap="go(`/pages/order/detail?id=${o.id}`)">
        <view class="flex-row" style="justify-content: space-between;">
          <text class="text-12 text-muted">{{ formatDateTime(o.createdAt) }}</text>
          <text :class="statusClass(o.status)">{{ statusLabel(o.status) }}</text>
        </view>
        <view class="divider" />
        <view v-for="(it, i) in o.items" :key="i" class="item">
          <text class="text-14 text-strong flex-1">{{ it.name || (it.courseProduct && it.courseProduct.name) || '课程' }}</text>
          <text class="text-12 text-muted">x{{ it.quantity || 1 }}</text>
          <text class="text-14">{{ formatMoney(it.unitPrice) }}</text>
        </view>
        <view class="divider" />
        <view class="flex-row" style="justify-content: space-between;">
          <text class="text-12 text-muted">共 {{ totalQty(o) }} 件</text>
          <text class="text-14 text-strong">合计 {{ formatMoney(o.actualPrice ?? o.originalPrice) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { orderApi } from '@/api/order'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDateTime, formatMoney } from '@/utils/format'
import { OrderStatusLabel } from '@/utils/constants'

export default {
  data() {
    return {
      tabs: [
        { label: '全部', value: '' },
        { label: '待支付', value: 'pending' },
        { label: '已支付', value: 'paid' },
        { label: '已取消', value: 'cancelled' }
      ],
      current: '',
      list: [],
      loading: true
    }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId'])
  },
  onShow() {
    if (this.activeStudentId) this.load()
  },
  methods: {
    formatDateTime, formatMoney,
    statusLabel(s) { return OrderStatusLabel[s] || '' },
    statusClass(s) {
      if (s === 'paid') return 'tag tag-success'
      if (s === 'cancelled' || s === 'refunded') return 'tag tag-warn'
      return 'tag'
    },
    totalQty(o) {
      return (o.items || []).reduce((acc, it) => acc + (it.quantity || 1), 0)
    },
    go(url) { uni.navigateTo({ url }) },
    async load() {
      this.loading = true
      try {
        const res = await orderApi.list({
          student: this.activeStudentId,
          status: this.current || undefined,
          pageSize: 50
        })
        this.list = res.data?.items || []
      } catch (_) {
        this.list = []
      } finally {
        this.loading = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 0 24rpx 24rpx; }
.tabs {
  display: flex;
  gap: 24rpx;
  padding: 16rpx 0;
  background: #fff;
  position: sticky;
  top: 0;
  z-index: 1;
  .tab {
    padding: 8rpx 0;
    font-size: 28rpx;
    color: #6b7280;
    &.active {
      color: #5B8FF9;
      font-weight: 600;
      border-bottom: 4rpx solid #5B8FF9;
    }
  }
}
.item {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 8rpx 0;
}
</style>
