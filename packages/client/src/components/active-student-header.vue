<template>
  <view class="header card">
    <view class="row" @tap="onTap">
      <view class="avatar">{{ avatarChar }}</view>
      <view class="meta flex-1">
        <view class="flex-row gap-8">
          <text class="text-16 text-strong">{{ student ? student.name : '请选择孩子' }}</text>
          <text v-if="hasMultiple" class="text-12 text-muted">点击切换 ▾</text>
        </view>
        <text v-if="student" class="text-12 text-muted">
          {{ orgName || '未选择机构' }}
        </text>
      </view>
    </view>
    <slot name="extra" />
  </view>
</template>

<script>
import { useStudentStore } from '@/stores/student'
import { useAuthStore } from '@/stores/auth'
import { mapState } from 'pinia'

export default {
  name: 'ActiveStudentHeader',
  computed: {
    ...mapState(useStudentStore, ['activeStudentId', 'list']),
    ...mapState(useAuthStore, ['currentOrgId', 'orgs']),
    student() {
      return this.list.find((s) => String(s.id) === String(this.activeStudentId)) || null
    },
    hasMultiple() {
      return this.list.length > 1
    },
    orgName() {
      const rel = this.orgs.find((r) => (r.org ? r.org.id === this.currentOrgId : r.id === this.currentOrgId))
      if (!rel) return ''
      return rel.org ? rel.org.name : rel.name
    },
    avatarChar() {
      if (!this.student) return '👶'
      return this.student.name.slice(-2)
    }
  },
  methods: {
    onTap() {
      if (!this.list.length) {
        uni.showToast({ title: '暂未关联孩子', icon: 'none' })
        return
      }
      uni.navigateTo({ url: '/pages/student/switch' })
    }
  }
}
</script>

<style lang="scss" scoped>
.header { padding: 24rpx; }
.row { display: flex; align-items: center; gap: 24rpx; }
.avatar {
  width: 72rpx;
  height: 72rpx;
  border-radius: 50%;
  background: #5B8FF9;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  font-weight: 600;
}
.meta { display: flex; flex-direction: column; gap: 4rpx; }
</style>
