<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!data" class="empty-state">课程产品不存在</view>
    <view v-else>
      <view class="card hero">
        <text class="title">{{ data.name }}</text>
        <view class="price-row">
          <text class="price-now">{{ formatMoney(currentPrice) }}</text>
          <text v-if="data.originalPrice && data.originalPrice > currentPrice" class="price-origin">
            {{ formatMoney(data.originalPrice) }}
          </text>
        </view>
        <text v-if="data.promotionActive && data.promotionPrice" class="tag tag-warn">活动中</text>
        <text v-if="!data.isActive" class="tag tag-warn">已下架</text>
      </view>

      <view class="card">
        <text class="text-16 text-strong">课程信息</text>
        <view class="divider" />
        <view class="row"><text class="text-12 text-muted">总课时</text><text class="text-14">{{ data.totalLessons }} 节</text></view>
        <view class="row"><text class="text-12 text-muted">单节时长</text><text class="text-14">{{ data.minutesPerLesson }} 分钟</text></view>
        <view class="row"><text class="text-12 text-muted">有效期</text><text class="text-14">{{ data.validDays }} 天</text></view>
        <view v-if="(data.subjects || []).length" class="row">
          <text class="text-12 text-muted">学科</text>
          <text class="text-14">{{ subjectsText }}</text>
        </view>
      </view>

      <view class="card">
        <text class="text-16 text-strong">教学大纲</text>
        <view class="divider" />
        <text class="text-14">{{ data.syllabus || '暂无教学大纲' }}</text>
      </view>

      <view class="card">
        <text class="text-16 text-strong">可加入的开班</text>
        <view class="divider" />
        <view v-if="!instances.length" class="text-12 text-muted">暂无可报名的开班</view>
        <view v-else>
          <view
            v-for="ci in instances"
            :key="ci.id"
            class="row-card"
            @tap="go(`/pages/courseInstance/detail?id=${ci.id}&productId=${data.id}`)"
          >
            <view class="flex-1">
              <text class="text-14 text-strong">{{ productName(ci) }}</text>
              <text class="text-12 text-muted">
                {{ teacherName(ci) }}{{ roomName(ci) ? ' · ' + roomName(ci) : '' }} · {{ formatDate(ci.startDate) }}
              </text>
            </view>
            <text :class="ciStatusClass(ci.status)">{{ ciStatusLabel(ci.status) }}</text>
          </view>
        </view>
      </view>

      <view class="footer">
        <view class="footer-info">
          <text class="text-12 text-muted">支付后将自动创建课包</text>
        </view>
        <button class="btn-primary" :disabled="!data.isActive" @tap="onBuy">立即购买</button>
      </view>
    </view>
  </view>
</template>

<script>
import { courseProductApi } from '@/api/courseProduct'
import { courseInstanceApi } from '@/api/courseInstance'
import { orderApi } from '@/api/order'
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatMoney, formatDate } from '@/utils/format'
import { CourseInstanceStatus, CourseInstanceStatusLabel } from '@/utils/constants'

export default {
  data() {
    return { id: '', data: null, instances: [], loading: true }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId']),
    currentPrice() {
      if (!this.data) return 0
      if (this.data.promotionActive && this.data.promotionPrice != null) return this.data.promotionPrice
      return this.data.discountPrice ?? this.data.price ?? 0
    },
    subjectsText() {
      if (!this.data?.subjects) return ''
      return this.data.subjects.map((s) => s.name).filter(Boolean).join('、')
    }
  },
  onLoad(query) {
    this.id = query.id
    this.load()
  },
  methods: {
    formatMoney, formatDate,
    go(url) { uni.navigateTo({ url }) },
    productName(ci) {
      const cp = ci.courseProduct
      return (cp && cp.name) || this.data?.name || '课程'
    },
    teacherName(ci) {
      const t = ci.teacher
      return t ? (t.realName || t.mobile || '老师') : ''
    },
    roomName(ci) {
      const r = ci.room
      return r ? r.name : ''
    },
    ciStatusLabel(s) { return CourseInstanceStatusLabel[s] || s },
    ciStatusClass(s) {
      if (s === CourseInstanceStatus.ACTIVE) return 'tag tag-success'
      if (s === CourseInstanceStatus.CLOSED) return 'tag'
      return 'tag'
    },
    async load() {
      this.loading = true
      try {
        const res = await courseProductApi.detail(this.id)
        this.data = res.data
        await this.loadInstances()
      } catch (_) {
        this.data = null
      } finally {
        this.loading = false
      }
    },
    async loadInstances() {
      try {
        const res = await courseInstanceApi.list({
          courseProduct: this.id,
          status: 'enrolling,active',
          pageSize: 20
        })
        this.instances = res.data?.items || []
      } catch (_) {
        this.instances = []
      }
    },
    async onBuy() {
      if (!this.activeStudentId) {
        return uni.showToast({ title: '请先选择孩子', icon: 'none' })
      }
      const r = await uni.showModal({
        title: '确认下单？',
        content: `课程：${this.data.name}\n金额：${formatMoney(this.currentPrice)}`
      })
      if (!r.confirm) return
      try {
        const res = await orderApi.create({
          student: this.activeStudentId,
          items: [{ courseProduct: this.id, quantity: 1 }],
          actualPrice: this.currentPrice
        })
        const order = res.data
        // 跳到详情 + 支付
        uni.redirectTo({ url: `/pages/order/detail?id=${order.id}` })
      } catch (_) {}
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; padding-bottom: 200rpx; }
.hero {
  display: flex;
  flex-direction: column;
  gap: 12rpx;
  .title { font-size: 40rpx; font-weight: 600; }
  .price-row { display: flex; align-items: baseline; gap: 12rpx; }
  .price-now { color: #f5222d; font-size: 48rpx; font-weight: 700; }
  .price-origin { color: #9ca3af; text-decoration: line-through; font-size: 24rpx; }
}
.row {
  display: flex;
  justify-content: space-between;
  padding: 8rpx 0;
}
.row-card {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 16rpx 0;
  border-bottom: 1rpx solid #f3f4f6;
  &:last-child { border-bottom: none; }
}
.footer {
  position: fixed;
  left: 0; right: 0; bottom: 0;
  display: flex;
  align-items: center;
  background: #fff;
  padding: 16rpx 24rpx;
  box-shadow: 0 -2rpx 12rpx rgba(0,0,0,0.05);
  .footer-info { flex: 1; }
  button { width: 280rpx; }
}
</style>
