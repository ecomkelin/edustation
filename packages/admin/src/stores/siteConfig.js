import { defineStore } from 'pinia'
import { siteConfigApi } from '@/api/siteConfig'

/**
 * 站点配置 (备案号 / 运营主体 / 版权年份) 全局 store.
 *
 * 在 main.js mount 前调一次 load(), 缓存到内存; AppFooter 等组件直接读 store.config.
 *
 * 不持久化到 localStorage —— 后台改了 site-config 后, 客户端下次启动即生效;
 * 浏览器刷新即重新拉一次, 数据始终新鲜.
 */
export const useSiteConfigStore = defineStore('siteConfig', {
  state: () => ({
    config: {
      copyrightYear: String(new Date().getFullYear()),
      operatorName: '',
      operatorAddress: '',
      operatorContact: '',
      icpNumber: '',
      policeBeianNumber: '',
      customerServicePhone: '',
      platformLogo: null
    },
    loaded: false
  }),
  getters: {
    /** Footer 拼接 "© 2026 上海某公司 · 沪ICP备 0000000号 · 沪公网安备 00000000号" */
    copyrightLine: (s) => {
      const c = s.config || {}
      const parts = []
      if (c.copyrightYear) parts.push(`© ${c.copyrightYear}`)
      if (c.operatorName) parts.push(c.operatorName)
      if (c.icpNumber) parts.push(c.icpNumber)
      if (c.policeBeianNumber) parts.push(c.policeBeianNumber)
      return parts.join(' · ')
    }
  },
  actions: {
    async load() {
      try {
        const res = await siteConfigApi.get()
        // http.js 解包后 res.data 即业务 data; 兜底防 undefined
        if (res && res.data) {
          this.config = { ...this.config, ...res.data }
        }
        this.loaded = true
      } catch (e) {
        // 加载失败不阻断 mount, Footer 用默认值兜底
        // eslint-disable-next-line no-console
        console.warn('[siteConfig] load failed', e && e.message)
      }
    },
    async update(payload) {
      const res = await siteConfigApi.update(payload)
      if (res && res.data) this.config = { ...this.config, ...res.data }
      return res
    }
  }
})
