import http from './http'

export const authApi = {
  login: (data) => http.post('/auth/login', data),
  logout: () => http.post('/auth/logout'),
  refresh: () => http.post('/auth/refresh'),
  me: () => http.get('/auth/me'),
  // 个人中心：自助修改资料（白名单 realName / avatar / idCard / region）
  updateMe: (data) => http.put('/auth/me', data),
  // 自助修改密码：oldPassword + newPassword；成功后其他设备的 refresh token 会被强制撤销
  changePassword: (data) => http.post('/auth/change-password', data)
}
