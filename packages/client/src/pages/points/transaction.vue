<template>
  <view class="page">
    <view class="balance card">
      <text class="num">{{ balance }}</text>
      <text class="label">当前积分</text>
    </view>

    <view class="card">
      <text class="text-16 text-strong">积分流水</text>
      <view class="divider" />
      <view v-if="loading" class="empty-state">加载中…</view>
      <view v-else-if="!list.length" class="text-12 text-muted">暂无流水</view>
      <view v-else>
        <view v-for="t in list" :key="t.id" class="row">
          <view class="flex-1">
            <text class="text-14">{{ t.remark || t.type }}</text>
            <text class="text-12 text-muted">{{ formatDateTime(t.createdAt) }}</text>
          </view>
          <text :class="t.amount > 0 ? 'amount-plus' : 'amount-minus'">
            {{ t.amount > 0 ? '+' : '' }}{{ t.amount }}
          </text>
        </view>
        <view v-if="hasMore" class="more" @tap="loadMore">点击加载更多</view>
        <view v-else class="text-12 text-muted" style="text-align: center; padding: 16rpx;">已经到底了</view>
      </view>
    </view>
  </view>
</template>

<script>
import { pointsApi } from '@/api/points'
import { usePointsStore } from '@/stores/points'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDateTime } from '@/utils/format'

export default {
  data() {
    return {
      list: [],
      loading: false,
      page: 1,
      pageSize: 20,
      hasMore: false,
      total: 0
    }
  },
  computed: {
    ...mapState(usePointsStore, ['balance']),
    ...mapState(useStudentStore, ['activeStudentId'])
  },
  onShow() {
    this.list = []
    this.page = 1
    this.refresh()
  },
  methods: {
    formatDateTime,
    async refresh() {
      this.loading = true
      try {
        const pts = usePointsStore()
        await pts.fetchMe()
      } catch (_) {}
      await this.load()
    },
    async load() {
      try {
        const res = await pointsApi.transactions({ page: this.page, pageSize: this.pageSize })
        const items = res.data?.items || []
        this.list = this.page === 1 ? items : [...this.list, ...items]
        this.total = res.data?.total || 0
        this.hasMore = this.list.length < this.total
      } catch (_) {
        if (this.page === 1) this.list = []
      } finally {
        this.loading = false
      }
    },
    loadMore() {
      this.page += 1
      this.load()
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.balance {
  text-align: center;
  padding: 48rpx 24rpx;
  background: linear-gradient(135deg, #5B8FF9 0%, #7AA9FF 100%);
  color: #fff;
  .num { display: block; font-size: 80rpx; font-weight: 700; line-height: 1; }
  .label { display: block; font-size: 24rpx; opacity: 0.9; margin-top: 8rpx; }
}
.row {
  display: flex;
  align-items: center;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-of-type { border-bottom: none; }
  .amount-plus { color: #f5222d; font-weight: 600; }
  .amount-minus { color: #6b7280; font-weight: 600; }
}
.more {
  text-align: center;
  padding: 24rpx;
  color: #5B8FF9;
  font-size: 26rpx;
}
</style>
