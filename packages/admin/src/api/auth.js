import http from './http'

// TODO: 阶段 1 任务 - 实现登录 / 刷新 / 登出
// 当前 views 还没人 import authApi，先把形状留好
export const authApi = {
  login: (data) => http.post('/auth/login', data),
  logout: () => http.post('/auth/logout'),
  refresh: () => http.post('/auth/refresh'),
  me: () => http.get('/auth/me')
}
