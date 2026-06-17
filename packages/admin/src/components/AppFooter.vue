<template>
  <footer class="app-footer">
    <div class="footer-line copyright">{{ siteConfig.copyrightLine || `© ${currentYear} EduStation` }}</div>
    <div class="footer-line links">
      <a
        v-if="siteConfig.config.icpNumber"
        href="https://beian.miit.gov.cn"
        target="_blank"
        rel="noopener"
      >{{ siteConfig.config.icpNumber }}</a>
      <span v-if="siteConfig.config.icpNumber && siteConfig.config.policeBeianNumber"> · </span>
      <a
        v-if="siteConfig.config.policeBeianNumber"
        href="http://www.beian.gov.cn/portal/registerSystemInfo"
        target="_blank"
        rel="noopener"
      >{{ siteConfig.config.policeBeianNumber }}</a>
      <template v-if="auth.isPlatformAdmin || hasAnyOrgPerm">
        <span v-if="siteConfig.config.icpNumber || siteConfig.config.policeBeianNumber"> · </span>
        <router-link to="/legal/platform" v-if="auth.isPlatformAdmin">平台协议</router-link>
        <span v-if="auth.isPlatformAdmin"> · </span>
        <router-link to="/legal/org-docs">机构协议</router-link>
      </template>
    </div>
    <div v-if="siteConfig.config.customerServicePhone" class="footer-line muted">
      客服 / 投诉:{{ siteConfig.config.customerServicePhone }}
    </div>
  </footer>
</template>

<script setup>
import { computed } from 'vue'
import { useSiteConfigStore } from '@/stores/siteConfig'
import { useAuthStore } from '@/stores/auth'

const siteConfig = useSiteConfigStore()
const auth = useAuthStore()
const currentYear = new Date().getFullYear()

// 当前用户在某机构是否拥有 legal.read 权限 (用于决定是否显示"机构协议"链接)
const hasAnyOrgPerm = computed(() => {
  if (!auth.orgs || !auth.orgs.length) return false
  return auth.orgs.some((o) => (o.positions || []).some((p) => (p.permissions || []).includes('legal.read')))
})
</script>

<style scoped>
.app-footer {
  padding: 16px 24px;
  background: #fff;
  border-top: 1px solid #ebeef5;
  text-align: center;
  font-size: 12px;
  color: #909399;
  flex-shrink: 0;
}
.footer-line { line-height: 1.8; }
.copyright { color: #606266; }
.footer-line a {
  color: #909399;
  text-decoration: none;
}
.footer-line a:hover {
  color: #409EFF;
  text-decoration: underline;
}
.muted { color: #c0c4cc; }
</style>
