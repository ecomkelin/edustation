/**
 * Auth Store - 登录态管理
 *
 * 设计要点 (参照 CLAUDE.md §5/§6):
 *  - accessToken 走 uni.storage (非 httpOnly,前端可用)
 *  - refreshToken 完全由后端 httpOnly cookie 管理,前端不感知
 *  - uni.request withCredentials:true 让 cookie 自动带上
 *  - requirePasswordChange 时强制跳改密页 (路由守卫)
 *  - 当前机构切换: 写到 storage + 调 /auth/me 同步 pendingConsents
 */
import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { storage, StorageKeys } from '@/utils/storage'

function readAuth() {
  return storage.get(StorageKeys.AUTH) || {}
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const saved = readAuth()
    return {
      accessToken: saved.accessToken || '',
      user: saved.user || null,
      orgs: saved.orgs || [],
      currentOrgId: saved.currentOrgId || '',
      pendingConsents: Array.isArray(saved.pendingConsents) ? saved.pendingConsents : []
    }
  },
  getters: {
    isAuthenticated: (s) => !!s.accessToken && !!s.user,
    isPlatformAdmin: (s) => !!s.user && s.user.isPlatformAdmin,
    requirePasswordChange: (s) => !!s.user && s.user.requirePasswordChange,
    mainOrg() {
      if (!this.orgs || !this.orgs.length) return null
      return this.orgs.find((o) => o.isMain) || this.orgs[0]
    },
    hasPendingConsents: (s) => Array.isArray(s.pendingConsents) && s.pendingConsents.length > 0
  },
  actions: {
    /**
     * 登录
     */
    /**
     * 应用 /me 返回: user/orgs/pendingConsents/currentOrgId + 落 storage。
     * login / fetchMe / 微信登录共用, 单点维护"选主机构 + persist"。
     * 仅在 currentOrgId 为空时才选主机构 (避免覆盖用户手动切换的机构)。
     */
    _applyMe(me) {
      this.user = me
      this.orgs = me.orgs || []
      if (Array.isArray(me.pendingConsents)) {
        this.pendingConsents = me.pendingConsents
      }
      if (!this.currentOrgId && this.orgs.length) {
        const main = this.orgs.find((o) => o.isMain) || this.orgs[0]
        this.currentOrgId = main.org ? main.org.id : main.id
        storage.set(StorageKeys.ORG_ID, this.currentOrgId)
      }
      this.persist()
      return me
    },

    async login({ mobile, password, captchaPass }) {
      const res = await authApi.login({ mobile, password, captchaPass })
      this.accessToken = res.accessToken
      this.user = res.user
      this.pendingConsents = Array.isArray(res.pendingConsents) ? res.pendingConsents : []
      // ⚠️ 立刻把 token 落 storage,否则下面 authApi.me() 在 request.js 里读不到
      //    (request.js 是从 storage 读 Authorization,不是从 Pinia 内存)
      this.persist()
      // 拉 /me 拿完整 orgs + 权限 + 机构级 pendingConsents
      this.currentOrgId = '' // 重置, 让 _applyMe 重新选主机构
      this._applyMe(await authApi.me())
      return this
    },

    /** 刷新 accessToken (H5 cookie 模式, 由 request.js doRefresh 自动调) */
    async refresh() {
      const res = await authApi.refresh()
      this.accessToken = res.accessToken
      this.persist()
      return res
    },

    async logout() {
      try {
        await authApi.logout()
      } catch (_) {
        /* ignore */
      }
      this.clear()
    },

    async fetchMe() {
      const me = await authApi.me()
      return this._applyMe(me)
    },

    // ─── 微信小程序登录 (2026-08) ───
    // 小程序不走 cookie: refresh token 由前端 storage 自管 (WX_REFRESH_TOKEN)。

    /** 把微信登录返回的 token 落地 + 拉 /me (wxLogin/wxBind 共用) */
    _consumeWxTokens({ accessToken, refreshToken }) {
      this.accessToken = accessToken
      if (refreshToken) storage.set(StorageKeys.WX_REFRESH_TOKEN, refreshToken)
      // ⚠️ 先 persist 落 storage, fetchMe 的请求才能从 storage 读到新 accessToken
      this.persist()
      this.currentOrgId = '' // 重置, 让 _applyMe 重新选主机构
      return this.fetchMe()
    },

    /** 微信静默登录 (老用户)。返回后端 { status: 'bound' | 'need_bind' } */
    async wxLogin({ code }) {
      const res = await authApi.wxLogin({ code })
      if (res.status === 'bound') await this._consumeWxTokens(res)
      return res
    },

    /** 微信绑定 / 自助注册。返回后端 { status: 'bound' | 'need_org' } */
    async wxBind({ loginCode, phoneCode, scene }) {
      const res = await authApi.wxBind({ loginCode, phoneCode, scene })
      if (res.status === 'bound') await this._consumeWxTokens(res)
      return res
    },

    /** 微信刷新 (小程序专用, 从 storage 读 refreshToken 走 body; 由 request.js doRefresh 调) */
    async wxRefresh() {
      const rt = storage.get(StorageKeys.WX_REFRESH_TOKEN)
      if (!rt) throw new Error('无 refresh token')
      const res = await authApi.wxRefresh({ refreshToken: rt })
      this.accessToken = res.accessToken
      if (res.refreshToken) storage.set(StorageKeys.WX_REFRESH_TOKEN, res.refreshToken)
      this.persist()
      return res
    },

    setOrg(orgId) {
      this.currentOrgId = orgId
      storage.set(StorageKeys.ORG_ID, orgId)
      this.persist()
    },

    /** 更新我的资料 (头像/姓名等) */
    async updateMe(data) {
      const res = await authApi.updateMe(data)
      // updateMe 返回完整 user,与 /me 一致
      this.user = res || this.user
      this.persist()
      return res
    },

    async changePassword({ oldPassword, newPassword }) {
      const res = await authApi.changePassword({ oldPassword, newPassword })
      // 改密成功,清除 requirePasswordChange 标志
      if (this.user) {
        this.user.requirePasswordChange = false
        this.persist()
      }
      return res
    },

    clearPendingConsents() {
      this.pendingConsents = []
      this.persist()
    },

    persist() {
      storage.set(StorageKeys.AUTH, {
        accessToken: this.accessToken,
        user: this.user,
        orgs: this.orgs,
        currentOrgId: this.currentOrgId,
        pendingConsents: this.pendingConsents
      })
    },

    clear() {
      this.accessToken = ''
      this.user = null
      this.orgs = []
      this.currentOrgId = ''
      this.pendingConsents = []
      storage.remove(StorageKeys.ORG_ID)
      storage.remove(StorageKeys.ACTIVE_STUDENT)
      storage.remove(StorageKeys.AUTH)
      storage.remove(StorageKeys.WX_REFRESH_TOKEN)
      storage.remove(StorageKeys.WX_SCENE)
    },

    /**
     * 启动时恢复登录态:
     *  1) 有本地 token -> /me 同步;
     *  2) 无本地 token -> refresh 一次;
     *  3) 失败 -> 清空 + 跳登录.
     */
    async restore() {
      try {
        if (this.accessToken) {
          await this.fetchMe()
        } else {
          // H5: cookie refresh; 小程序/App: body refresh (从 storage 读 wx_refresh_token)
          // #ifdef H5
          await this.refresh()
          // #endif
          // #ifndef H5
          await this.wxRefresh()
          // #endif
          await this.fetchMe()
        }
        return this.user
      } catch (_) {
        this.clear()
        return null
      }
    }
  }
})