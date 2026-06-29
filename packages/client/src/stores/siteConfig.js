/**
 * SiteConfig Store - 平台公开配置 (R-3200)
 * 备案号 / 版权 / 运营主体 / 服务条款
 */
import { defineStore } from 'pinia'
import { siteConfigApi } from '@/api/siteConfig'

export const useSiteConfigStore = defineStore('siteConfig', {
  state: () => ({
    data: null,
    loading: false
  }),
  getters: {
    icp: (s) => (s.data && s.data.icp) || '',
    copyright: (s) => (s.data && s.data.copyright) || '© EduStation',
    operator: (s) => (s.data && s.data.operator) || '',
    supportPhone: (s) => (s.data && s.data.supportPhone) || '',
    platformName: (s) => (s.data && s.data.platformName) || 'EduStation'
  },
  actions: {
    async load(force = false) {
      if (this.data && !force) return this.data
      this.loading = true
      try {
        const res = await siteConfigApi.get()
        this.data = res || {}
        return this.data
      } catch (e) {
        // 静默失败 - 不阻塞登录
        console.warn('[siteConfig] load failed', e)
        this.data = {}
        return this.data
      } finally {
        this.loading = false
      }
    }
  }
})