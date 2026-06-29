<!--
  OrgFooter - 机构备案信息 Footer
  公开端点 /site-config 拿 icp / copyright / operator
-->
<template>
  <view class="org-footer">
    <view v-if="config.icp" class="org-footer__line">
      <text class="org-footer__text">
        <text v-if="config.operator">{{ config.operator }} | </text>
        {{ config.icp }}
      </text>
    </view>
    <view v-if="config.copyright" class="org-footer__line">
      <text class="org-footer__text org-footer__text--muted">
        {{ config.copyright }}
      </text>
    </view>
  </view>
</template>

<script>
import { useSiteConfigStore } from '@/stores/siteConfig'
export default {
  name: 'OrgFooter',
  computed: {
    config() {
      return useSiteConfigStore()
    }
  }
}
</script>

<style lang="scss" scoped>
.org-footer {
  padding: $spacing-xl $spacing-md $spacing-lg;
  text-align: center;

  &__line {
    margin-bottom: $spacing-xs;
  }

  &__text {
    font-size: $font-xs;
    color: $text-tertiary;

    &--muted {
      color: $text-disabled;
    }
  }
}
</style>