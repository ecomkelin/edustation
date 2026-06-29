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
  }
}