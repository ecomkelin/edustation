import { defineStore } from 'pinia'
import http from '@/api/http'

const LS_KEY = 'edustation_auth'

function readLs() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeLs(state) {
  if (state) localStorage.setItem(LS_KEY, JSON.stringify(state))
  else localStorage.removeItem(LS_KEY)
}

export const useAuthStore = defineStore('auth', {
  state: () => {
    const saved = readLs() || {}
    return {
      accessToken: saved.accessToken || '',
      // 注意：refresh token 始终走 httpOnly cookie，前端不可见也不持久化
      user: saved.user || null,
      orgs: saved.orgs || [],
      currentOrgId: saved.currentOrgId || '',
      activeStudentId: saved.activeStudentId || '',
      // 招生试听 (2026-06): 首登强改密标志
      //   login() / fetchMe() 检测到 requirePasswordChange=true 时设 true;
      //   改密成功后清 false; 路由守卫据此跳 /reset-password?initial=1
      requirePasswordChange: !!saved.requirePasswordChange,
      // 法律协议 (2026-06): 当前用户未对齐的协议清单 (平台级 + 当前机构级)
      //   login() / fetchMe() 写入; 接受页提交后 clearPendingConsents() 清空
      //   路由守卫 (router/index.js) 据 hasPendingConsents 拦到 /agreement/accept
      pendingConsents: Array.isArray(saved.pendingConsents) ? saved.pendingConsents : []
    }
  },
  getters: {
    isAuthenticated: (s) => !!s.accessToken && !!s.user,
    isPlatformAdmin: (s) => !!s.user && s.user.isPlatformAdmin,
    needPasswordChange: (s) => !!(s.user && s.user.requirePasswordChange) || s.requirePasswordChange,
    /** 是否有未对齐版本的协议待接受 (平台级 + 机构级 union) */
    hasPendingConsents: (s) => Array.isArray(s.pendingConsents) && s.pendingConsents.length > 0
  },
  actions: {
    async login({ mobile, password }) {
      const res = await http.post('/auth/login', { mobile, password })
      this.accessToken = res.data.accessToken
      this.user = res.data.user
      // 招生试听 (2026-06): 首登强改密标志
      this.requirePasswordChange = !!res.data.requirePasswordChange
      // 法律协议 (2026-06): 平台级待同意清单 (login 时尚未选 org, 此处只有平台级)
      this.pendingConsents = Array.isArray(res.data.pendingConsents) ? res.data.pendingConsents : []
      // 拉取 /me 拿 orgs
      // 注:必须显式传 Authorization header —— 此处 store.accessToken 刚赋值,
      // axios 拦截器在下一次请求前才能看到(虽然 pinia 状态同步可见,
      // 但避免任何 race condition,直接传 header 最稳)。
      const me = await http.get('/auth/me', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      })
      this.orgs = me.data.orgs
      if (me.data.orgs.length && !this.currentOrgId) {
        const main = me.data.orgs.find((o) => o.isMain) || me.data.orgs[0]
        this.currentOrgId = main.id
      }
      // 用 /me 返回的更全的 pendingConsents(含机构级) 覆盖 login 返回的(仅平台级)
      if (Array.isArray(me.data.pendingConsents)) {
        this.pendingConsents = me.data.pendingConsents
      }
      this.persist()
      return this
    },

    async refresh() {
      const res = await http.post('/auth/refresh')
      this.accessToken = res.data.accessToken
      this.persist()
      return res.data
    },

    async logout() {
      try {
        await http.post('/auth/logout')
      } catch (_) {
        /* ignore */
      }
      this.clear()
    },

    async fetchMe() {
      const me = await http.get('/auth/me')
      this.user = me.data
      this.orgs = me.data.orgs
      // 招生试听 (2026-06): 从 /me 拉到的 user.requirePasswordChange 同步到 store
      this.requirePasswordChange = !!this.user?.requirePasswordChange
      // 法律协议 (2026-06): 同步 pendingConsents (服务端按 x-org-id 计算了机构维度)
      if (Array.isArray(me.data.pendingConsents)) {
        this.pendingConsents = me.data.pendingConsents
      }
      // 关键:refresh / restore 时如果 currentOrgId 不在新 orgs 列表(或为空),要重设。
      // 否则 Dashboard 第 149 行 `if (!currentOrgId.value) return` 会静默不请求,
      // 数字全显示 0(不是 loading,不是错误)。
      const inList = (this.orgs || []).some((o) => o.id === this.currentOrgId)
      if (!this.currentOrgId || !inList) {
        if (this.orgs && this.orgs.length) {
          const main = this.orgs.find((o) => o.isMain) || this.orgs[0]
          this.currentOrgId = main.id
        } else {
          this.currentOrgId = ''
        }
      }
      this.persist()
      return me.data
    },

    setOrg(orgId) {
      this.currentOrgId = orgId
      this.persist()
    },

    setActiveStudent(studentId) {
      this.activeStudentId = studentId
      this.persist()
    },

    /**
     * 启动时从 localStorage 恢复并调 /me 验证。
     * 若 access token 已过期，http 拦截器会自动用 cookie 里的 refresh token 续签后重放本次请求；
     * 续签也失败再 clear，由路由守卫推到登录页。
     */
    async restore() {
      // 没本地 access token 也试一次 refresh：浏览器 cookie 可能还在(7 天)
      try {
        if (!this.accessToken) {
          await this.refresh()
        }
        await this.fetchMe()
        return this.user
      } catch (e) {
        this.clear()
        return null
      }
    },

    persist() {
      writeLs({
        accessToken: this.accessToken,
        user: this.user,
        orgs: this.orgs,
        currentOrgId: this.currentOrgId,
        activeStudentId: this.activeStudentId,
        requirePasswordChange: this.requirePasswordChange,
        pendingConsents: this.pendingConsents
      })
    },

    clear() {
      this.accessToken = ''
      this.user = null
      this.orgs = []
      this.currentOrgId = ''
      this.activeStudentId = ''
      this.requirePasswordChange = false
      this.pendingConsents = []
      writeLs(null)
    },

    /**
     * 招生试听 (2026-06): 改密成功后调用, 清掉强改标志
     */
    clearRequirePasswordChange() {
      this.requirePasswordChange = false
      if (this.user) this.user.requirePasswordChange = false
      this.persist()
    },

    /**
     * 法律协议 (2026-06): 接受页提交成功后调用, 清空待同意清单
     */
    clearPendingConsents() {
      this.pendingConsents = []
      this.persist()
    }
  }
})
