import { defineStore } from 'pinia'
import { authApi } from '@/api/auth'
import { storage, StorageKeys } from '@/utils/storage'

/**
 * 家长端登录态管理。
 *
 * 设计：
 *  - accessToken 走 storage（非 httpOnly，存到本地；refreshToken 必须由后端通过
 *    httpOnly cookie 下发，uni.request withCredentials:true 让 cookie 自动携带）。
 *  - 持久化只存 accessToken / user / orgs / currentOrgId，refresh token 不落本地。
 *  - restore() 启动时调用：先尝试 refresh，refresh 失败再清理并跳登录。
 */
function readLs() {
  const raw = storage.get(StorageKeys.AUTH)
  if (!raw) return null
  try {
    return typeof raw === 'string' ? JSON.parse(raw) : raw
  } catch (_) {
    return null
  }
}

function writeLs(state) {
  if (state) storage.set(StorageKeys.AUTH, JSON.stringify(state))
  else storage.remove(StorageKeys.AUTH)
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const saved = readLs() || {}
    return {
      accessToken: saved.accessToken || '',
      user: saved.user || null,
      orgs: saved.orgs || [],
      currentOrgId: saved.currentOrgId || '',
      // 法律协议 (2026-06): 平台 + 当前机构内未对齐版本的协议清单
      // App.vue watch 该字段 > 0 时弹层强制接受
      pendingConsents: Array.isArray(saved.pendingConsents) ? saved.pendingConsents : []
    }
  },
  getters: {
    isAuthenticated: (s) => !!s.accessToken && !!s.user,
    isPlatformAdmin: (s) => !!s.user && s.user.isPlatformAdmin,
    // 家长在多机构场景下取主机构
    mainOrg() {
      if (!this.orgs || !this.orgs.length) return null
      return this.orgs.find((o) => o.isMain) || this.orgs[0]
    },
    hasPendingConsents: (s) => Array.isArray(s.pendingConsents) && s.pendingConsents.length > 0
  },
  actions: {
    async login({ mobile, password }) {
      const res = await authApi.login({ mobile, password })
      this.accessToken = res.data.accessToken
      this.user = res.data.user
      // 法律协议 (2026-06): 平台级待同意清单 (login 时尚未选 org, 只有平台级)
      this.pendingConsents = Array.isArray(res.data.pendingConsents) ? res.data.pendingConsents : []
      const me = await authApi.me()
      this.orgs = me.data.orgs || []
      if (this.orgs.length) {
        const main = this.orgs.find((o) => o.isMain) || this.orgs[0]
        this.currentOrgId = main.org ? main.org.id : main.id
      }
      // 用 /me 返回的更全的 pendingConsents (含机构级) 覆盖
      if (Array.isArray(me.data.pendingConsents)) {
        this.pendingConsents = me.data.pendingConsents
      }
      storage.set(StorageKeys.ORG_ID, this.currentOrgId)
      this.persist()
      return this
    },

    async refresh() {
      const res = await authApi.refresh()
      this.accessToken = res.data.accessToken
      this.persist()
      return res.data
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
      this.user = me.data
      this.orgs = me.data.orgs || []
      // 法律协议 (2026-06): 同步 pendingConsents (按 x-org-id 含机构级)
      if (Array.isArray(me.data.pendingConsents)) {
        this.pendingConsents = me.data.pendingConsents
      }
      if (!this.currentOrgId && this.orgs.length) {
        const main = this.orgs.find((o) => o.isMain) || this.orgs[0]
        this.currentOrgId = main.org ? main.org.id : main.id
        storage.set(StorageKeys.ORG_ID, this.currentOrgId)
      }
      this.persist()
      return me.data
    },

    setOrg(orgId) {
      this.currentOrgId = orgId
      storage.set(StorageKeys.ORG_ID, orgId)
      this.persist()
    },

    persist() {
      writeLs({
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
      writeLs(null)
    },

    /** 法律协议 (2026-06): 接受页提交成功后清空 */
    clearPendingConsents() {
      this.pendingConsents = []
      this.persist()
    },

    /**
     * 启动时恢复登录态：
     *  1) 有本地 token -> 直接 /me；
     *  2) 无本地 token -> 尝试 refresh（cookie 可能还在 7 天内）；
     *  3) 失败 -> clear()。
     */
    async restore() {
      try {
        if (this.accessToken) {
          await this.fetchMe()
        } else {
          await this.refresh()
          await this.fetchMe()
        }
        return this.user
      } catch (e) {
        this.clear()
        return null
      }
    }
  }
})
