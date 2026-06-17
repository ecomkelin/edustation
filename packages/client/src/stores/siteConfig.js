import { defineStore } from 'pinia'
import { siteConfigApi } from '@/api/siteConfig'

/**
 * 站点配置 store (client / uni-app 端)
 *
 * - App.vue onLaunch 时 load() 一次
 * - 「我的」页底部 footer 直接读 store.config 显示备案 + 版权
 * - 后台改了站点配置后, 用户下次启动 app 即生效
 */
export const useSiteConfigStore = defineStore('siteConfig', {
  state: () => ({
    config: {
      copyrightYear: String(new Date().getFullYear()),
      operatorName: 'EduStation',
      icpNumber: '',
      policeBeianNumber: '',
      customerServicePhone: ''
    },
    loaded: false
  }),
  getters: {
    /** Footer 主文案 */
    copyrightLine: (s) => {
      const c = s.config || {}
      const parts = []
      if (c.copyrightYear) parts.push(`© ${c.copyrightYear}`)
      if (c.operatorName) parts.push(c.operatorName)
      return parts.join(' ')
    },
    /** 备案号行 (icp + 公安网安) */
    beianLine: (s) => {
      const c = s.config || {}
      const parts = []
      if (c.icpNumber) parts.push(c.icpNumber)
      if (c.policeBeianNumber) parts.push(c.policeBeianNumber)
      return parts.join(' · ')
    }
  },
  actions: {
    async load() {
      try {
        const res = await siteConfigApi.get()
        if (res && res.data) {
          this.config = { ...this.config, ...res.data }
        }
        this.loaded = true
      } catch (e) {
        // 加载失败不阻断 mount, 用默认值兜底
        // eslint-disable-next-line no-console
        console.warn('[siteConfig] load failed', e && e.message)
      }
    }
  }
})
