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

    <!-- 下单协议确认弹层 (2026-06): 拉取购买协议 + 退费规则, 必须全勾才能下单 -->
    <view v-if="agreementSheetVisible" class="agree-mask" @tap="closeAgreementSheet">
      <view class="agree-sheet" @tap.stop>
        <view class="agree-header">
          <text class="agree-title">下单前请阅读并同意以下协议</text>
          <text class="agree-close" @tap="closeAgreementSheet">×</text>
        </view>
        <view class="agree-amount">
          <text class="text-12 text-muted">订单金额</text>
          <text class="amount">{{ formatMoney(currentPrice) }}</text>
        </view>
        <scroll-view scroll-y class="agree-body">
          <view v-for="doc in pendingOrderDocs" :key="doc.docKey" class="agree-doc">
            <view class="agree-doc-title">
              <text class="t">《{{ doc.title }}》</text>
              <text class="tag">v{{ doc.version }}</text>
            </view>
            <view class="agree-doc-preview">
              <rich-text :nodes="doc.contentHtml || ''" />
            </view>
            <view class="agree-doc-check" @tap="toggleDocAgree(doc.docKey)">
              <view class="checkbox" :class="{ checked: !!agreedMap[doc.docKey] }">
                <text v-if="agreedMap[doc.docKey]">✓</text>
              </view>
              <text class="t">我已阅读并同意《{{ doc.title }}》</text>
            </view>
          </view>
        </scroll-view>
        <view class="agree-footer">
          <button class="btn-secondary" :disabled="submitting" @tap="closeAgreementSheet">取消</button>
          <button class="btn-primary" :disabled="!allAgreed || submitting" :loading="submitting" @tap="confirmBuy">
            同意并下单
          </button>
        </view>
      </view>
    </view>
  </view>
</template>

<script>
import { courseProductApi } from '@/api/courseProduct'
import { courseInstanceApi } from '@/api/courseInstance'
import { orderApi } from '@/api/order'
import { legalApi } from '@/api/legal'
import { useStudentStore } from '@/stores/student'
import { useAuthStore } from '@/stores/auth'
import { mapState } from 'pinia'
import { formatMoney, formatDate } from '@/utils/format'
import { CourseInstanceStatus, CourseInstanceStatusLabel } from '@/utils/constants'

// 下单时必须同意的机构级协议 keys (与后端 LegalDoc enum 一致)
const ORDER_REQUIRED_KEYS = ['purchase-agreement', 'refund-policy']

export default {
  data() {
    return {
      id: '',
      data: null,
      instances: [],
      loading: true,
      // 下单协议弹层
      agreementSheetVisible: false,
      pendingOrderDocs: [],
      agreedMap: {},
      submitting: false
    }
  },
  computed: {
    ...mapState(useStudentStore, ['activeStudentId']),
    ...mapState(useAuthStore, ['currentOrgId']),
    currentPrice() {
      if (!this.data) return 0
      if (this.data.promotionActive && this.data.promotionPrice != null) return this.data.promotionPrice
      return this.data.discountPrice ?? this.data.price ?? 0
    },
    subjectsText() {
      if (!this.data?.subjects) return ''
      return this.data.subjects.map((s) => s.name).filter(Boolean).join('、')
    },
    allAgreed() {
      return this.pendingOrderDocs.every((d) => !!this.agreedMap[d.docKey])
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
    /**
     * 下单流程 (2026-06 加协议勾选):
     *  1. 校验当前孩子存在
     *  2. 拉本机构 purchase-agreement + refund-policy 当前生效版
     *  3. 弹层强制勾选 → confirmBuy 调 orderApi.create({...payload, agreements})
     */
    async onBuy() {
      if (!this.activeStudentId) {
        return uni.showToast({ title: '请先选择孩子', icon: 'none' })
      }
      if (!this.currentOrgId) {
        return uni.showToast({ title: '机构信息缺失', icon: 'none' })
      }
      // 拉所有强制勾选的协议
      uni.showLoading({ title: '加载协议...' })
      try {
        const docs = []
        for (const key of ORDER_REQUIRED_KEYS) {
          try {
            const r = await legalApi.getOrgDoc(this.currentOrgId, key)
            if (r && r.data && r.data._id) {
              docs.push({
                docKey: r.data.key,
                title: r.data.title,
                version: r.data.version,
                contentHtml: r.data.contentHtml || ''
              })
            }
          } catch (_) {
            // 协议不存在: 视作机构未启用该项, 跳过 (后端 create 端会再校验一次)
          }
        }
        if (!docs.length) {
          // 无强制协议, 走旧流程直接下单
          return this.directBuyWithoutAgreement()
        }
        this.pendingOrderDocs = docs
        this.agreedMap = {}
        this.agreementSheetVisible = true
      } finally {
        uni.hideLoading()
      }
    },
    closeAgreementSheet() {
      if (this.submitting) return
      this.agreementSheetVisible = false
      this.pendingOrderDocs = []
      this.agreedMap = {}
    },
    toggleDocAgree(key) {
      this.$set
        ? this.$set(this.agreedMap, key, !this.agreedMap[key])
        : (this.agreedMap = { ...this.agreedMap, [key]: !this.agreedMap[key] })
    },
    async directBuyWithoutAgreement() {
      const r = await uni.showModal({
        title: '确认下单?',
        content: `课程:${this.data.name}\n金额:${formatMoney(this.currentPrice)}`
      })
      if (!r.confirm) return
      try {
        const res = await orderApi.create({
          student: this.activeStudentId,
          items: [{ courseProduct: this.id, quantity: 1 }],
          actualPrice: this.currentPrice
        })
        const order = res.data
        uni.redirectTo({ url: `/pages/order/detail?id=${order.id}` })
      } catch (_) {}
    },
    async confirmBuy() {
      if (!this.allAgreed) return
      this.submitting = true
      try {
        const agreements = this.pendingOrderDocs.map((d) => ({
          docKey: d.docKey,
          version: d.version,
          type: 'org',
          org: this.currentOrgId
        }))
        const res = await orderApi.create({
          student: this.activeStudentId,
          items: [{ courseProduct: this.id, quantity: 1 }],
          actualPrice: this.currentPrice,
          agreements
        })
        const order = res.data
        this.agreementSheetVisible = false
        uni.showToast({ title: '下单成功', icon: 'success' })
        setTimeout(() => uni.redirectTo({ url: `/pages/order/detail?id=${order.id}` }), 400)
      } catch (e) {
        // 后端 400/422 可能是"协议升级了", 重拉协议提示
        if (e && e.response && e.response.data && e.response.data.data && e.response.data.data.pending) {
          uni.showToast({ title: '协议已更新, 请重新阅读', icon: 'none', duration: 2500 })
          this.agreementSheetVisible = false
          setTimeout(() => this.onBuy(), 600)
        }
      } finally {
        this.submitting = false
      }
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

/* 下单协议弹层 */
.agree-mask {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.45);
  z-index: 9999;
  display: flex;
  align-items: flex-end;
}
.agree-sheet {
  width: 100%;
  max-height: 85vh;
  background: #fff;
  border-radius: 24rpx 24rpx 0 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.agree-header {
  display: flex;
  align-items: center;
  padding: 24rpx 32rpx 16rpx;
  border-bottom: 1rpx solid #f3f4f6;
  .agree-title { flex: 1; font-size: 30rpx; font-weight: 600; }
  .agree-close { font-size: 40rpx; color: #9ca3af; padding: 0 16rpx; }
}
.agree-amount {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16rpx 32rpx;
  background: #fff7ed;
  .amount { color: #f5222d; font-size: 40rpx; font-weight: 700; }
}
.agree-body {
  flex: 1;
  padding: 16rpx 32rpx;
  overflow-y: auto;
}
.agree-doc {
  padding: 16rpx 0;
  border-bottom: 1rpx dashed #e5e7eb;
  &:last-child { border-bottom: none; }
}
.agree-doc-title {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 8rpx;
  .t { font-size: 28rpx; font-weight: 600; }
  .tag {
    background: #eef2ff;
    color: #5B8FF9;
    font-size: 22rpx;
    padding: 2rpx 10rpx;
    border-radius: 6rpx;
  }
}
.agree-doc-preview {
  max-height: 280rpx;
  overflow-y: auto;
  font-size: 24rpx;
  color: #4b5563;
  line-height: 1.6;
  padding: 12rpx;
  background: #fafafa;
  border-radius: 8rpx;
  border: 1rpx solid #f3f4f6;
  margin-bottom: 12rpx;
}
.agree-doc-check {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx 0;
  .checkbox {
    width: 32rpx;
    height: 32rpx;
    border: 2rpx solid #d1d5db;
    border-radius: 6rpx;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    color: transparent;
    &.checked {
      background: #5B8FF9;
      border-color: #5B8FF9;
      color: #fff;
    }
  }
  .t { font-size: 26rpx; color: #1f2937; }
}
.agree-footer {
  display: flex;
  gap: 16rpx;
  padding: 16rpx 32rpx 32rpx;
  border-top: 1rpx solid #f3f4f6;
  background: #fff;
  button { flex: 1; }
}
</style>
