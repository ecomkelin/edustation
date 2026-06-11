<template>
  <view class="page">
    <view v-if="loading" class="empty-state">加载中…</view>
    <view v-else-if="!list.length" class="empty-state">
      <text>当前账号暂未关联孩子</text>
      <text class="text-muted text-12">请联系机构管理员添加</text>
    </view>
    <view v-else class="list">
      <view
        v-for="s in list"
        :key="s.id"
        class="row card"
        :class="{ active: s.id === activeStudentId }"
        @tap="onPick(s.id)"
      >
        <view class="avatar">
          <text>{{ avatarChar(s.name) }}</text>
        </view>
        <view class="info flex-1">
          <view class="flex-row gap-8">
            <text class="text-16 text-strong">{{ s.name }}</text>
            <text class="tag">{{ genderLabel(s.gender) }}</text>
            <text v-if="!s.isActive" class="tag tag-warn">已离校</text>
          </view>
          <text class="text-12 text-muted">
            {{ s.birthday ? formatBirth(s.birthday) : '未填写生日' }}
          </text>
        </view>
        <text v-if="s.id === activeStudentId" class="check">✓</text>
      </view>
    </view>
  </view>
</template>

<script>
import { useStudentStore } from '@/stores/student'
import { mapState } from 'pinia'
import { formatDate } from '@/utils/format'
import { GenderLabel } from '@/utils/constants'

export default {
  data() {
    return { loading: true }
  },
  computed: {
    ...mapState(useStudentStore, ['list', 'activeStudentId'])
  },
  async onLoad() {
    const s = useStudentStore()
    if (!s.list.length) {
      try { await s.fetchMyStudents() } catch (_) {}
    }
    this.loading = false
  },
  methods: {
    onPick(id) {
      const s = useStudentStore()
      s.setActive(id)
      uni.showToast({ title: '已切换', icon: 'success' })
      setTimeout(() => uni.navigateBack(), 400)
    },
    avatarChar(name) {
      if (!name) return '👶'
      return name.slice(-2)
    },
    genderLabel(g) {
      return GenderLabel[g] || ''
    },
    formatBirth(d) {
      if (!d) return ''
      return `生日 ${formatDate(d)}`
    }
  }
}
</script>

<style lang="scss" scoped>
.page { padding: 24rpx; }
.row {
  display: flex;
  align-items: center;
  gap: 24rpx;
  padding: 24rpx;
  &.active {
    border: 2rpx solid #5B8FF9;
    background: #f0f5ff;
  }
}
.avatar {
  width: 80rpx;
  height: 80rpx;
  border-radius: 50%;
  background: #5B8FF9;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 600;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.check {
  color: #5B8FF9;
  font-size: 36rpx;
  font-weight: 700;
}
</style>
