/**
 * Auth API - 登录/刷新/登出/me/改密
 * R-0100/R-0101/R-0102/R-0103/R-0104/R-0105
 */
import { http } from './request'

export const authApi = {
  login({ mobile, password, captchaPass }) {
    return http.post('/auth/login', { mobile, password, captchaPass }, { skipRefresh: true })
  },

  refresh() {
    return http.post('/auth/refresh', {}, { skipRefresh: true })
  },

  logout() {
    return http.post('/auth/logout', {}, { skipRefresh: true })
  },

  me() {
    return http.get('/auth/me')
  },

  updateMe(data) {
    return http.put('/auth/me', data)
  },

  changePassword({ oldPassword, newPassword }) {
    return http.post('/auth/change-password', { oldPassword, newPassword })
  },

  // ─── 微信小程序登录 (2026-08) R-0106/R-0107/R-0108 ───
  // 小程序不走 cookie: refresh token 由前端 storage 自管
  wxLogin({ code }) {
    return http.post('/auth/wx-login', { code }, { skipRefresh: true })
  },

  wxBind({ loginCode, phoneCode, scene }) {
    return http.post('/auth/wx-bind', { loginCode, phoneCode, scene }, { skipRefresh: true })
  },

  wxRefresh({ refreshToken }) {
    return http.post('/auth/wx-refresh', { refreshToken }, { skipRefresh: true })
  }
}