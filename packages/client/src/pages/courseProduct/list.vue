<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!list.length" class="empty-state">
      <text>暂无可报名课程产品</text>
    </view>
    <view v-else>
      <view
        v-for="p in list"
        :key="p.id"
        class="card product"
        @tap="go(`/pages/courseProduct/detail?id=${p.id}`)"
      >
        <view class="flex-row" style="justify-content: space-between;">
          <text class="text-16 text-strong">{{ p.name }}</text>
          <text v-if="!p.isActive" class="tag tag-warn">已下架</text>
        </view>
        <text class="text-12 text-muted">总课时 {{ p.totalLessons }} · 单节 {{ p.minutesPerLesson }} 分钟</text>
        <view class="divider" />
        <view class="flex-row" style="justify-content: space-between;">
          <text class="price">{{ formatMoney(p.discountPrice ?? p.price ?? 0) }}</text>
          <text v-if="p.originalPrice && p.originalPrice > (p.discountPrice ?? p.price ?? 0)" class="text-12 text-muted" style="text-decoration: line-through;">
            {{ formatMoney(p.originalPrice) }}
          </text>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { courseProductApi } from '@/api/courseProduct'
import { formatMoney } from '@/utils/format'

export default {
  data() { return { list: [], loading: true } },
  onShow() { this.load() },
  methods: {
    formatMoney,
    go(url) { uni.navigateTo({ url }) },
    async load() {
      this.loading = true
      try {
        const res = await courseProductApi.list({ isActive: true, pageSize: 50 })
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
.page { padding: 24rpx; }
.product {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  .price {
    color: #f5222d;
    font-size: 36rpx;
    font-weight: 700;
  }
}
</style>
