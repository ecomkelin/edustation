<!--
  协议列表 - 平台 + 当前机构协议
-->
<template>
  <view class="legal-list">
    <view class="legal-list__group">
      <text class="legal-list__group-title">平台协议</text>
      <view
        v-for="item in platformList"
        :key="item.key"
        class="legal-list__item press"
        @tap="goDetail(item.key, item.title, 'platform')"
      >
        <text class="legal-list__icon">📜</text>
        <view class="legal-list__info">
          <text class="legal-list__title">{{ item.title }}</text>
          <text class="legal-list__desc">生效中</text>
        </view>
        <text class="legal-list__arrow">›</text>
      </view>
    </view>

    <view v-if="orgList.length" class="legal-list__group">
      <text class="legal-list__group-title">机构协议</text>
      <view
        v-for="item in orgList"
        :key="item.key"
        class="legal-list__item press"
        @tap="goDetail(item.key, item.title, 'org', item.orgId)"
      >
        <text class="legal-list__icon">🏫</text>
        <view class="legal-list__info">
          <text class="legal-list__title">{{ item.title }}</text>
          <text class="legal-list__desc">{{ item.orgName }}</text>
        </view>
        <text class="legal-list__arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script>
export default {
  data() {
    return {
      platformList: [
        { key: 'user-agreement', title: '用户协议' },
        { key: 'privacy-policy', title: '隐私政策' }
      ],
      orgList: []
    }
  },
  methods: {
    goDetail(key, title, scope, orgId) {
      uni.navigateTo({ url: `/pages/legal/detail?key=${key}&title=${encodeURIComponent(title)}&scope=${scope || ''}${orgId ? '&orgId=' + orgId : ''}` })
    }
  }
}
</script>

<style lang="scss" scoped>
.legal-list {
  min-height: 100vh;
  background: $bg-page;
  padding: $spacing-md;
}

.legal-list__group {
  margin-bottom: $spacing-lg;
}

.legal-list__group-title {
  display: block;
  font-size: $font-sm;
  color: $text-secondary;
  padding: $spacing-sm $spacing-xs;
  margin-bottom: $spacing-xs;
}

.legal-list__item {
  display: flex;
  align-items: center;
  padding: $spacing-md;
  background: $bg-card;
  border-radius: $radius-md;
  margin-bottom: $spacing-xs;
  box-shadow: $shadow-card;
}

.legal-list__icon {
  font-size: 48rpx;
  margin-right: $spacing-md;
}

.legal-list__info {
  flex: 1;
}

.legal-list__title {
  display: block;
  font-size: $font-base;
  font-weight: $font-weight-semibold;
  color: $text-primary;
  margin-bottom: 4rpx;
}

.legal-list__desc {
  font-size: $font-xs;
  color: $text-secondary;
}

.legal-list__arrow {
  font-size: 40rpx;
  color: $text-tertiary;
}
</style>