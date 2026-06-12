import http from './http'

export const userApi = {
  list: (params) => http.get('/users', { params }),
  lookup: (params) => http.get('/users/lookup', { params }),
  detail: (id) => http.get(`/users/${id}`),
  create: (data) => http.post('/users', data),
  update: (id, data) => http.put(`/users/${id}`, data),
  // 误操删除（超管 + 二次密码 + 互锁检查）
  remove: (id, { password } = {}) => http.delete(`/users/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/users/${id}/removable-check`),
  changePassword: (id, data) => http.post(`/users/${id}/change-password`, data),
  resetPassword: (id, data) => http.post(`/users/${id}/reset-password`, data),
  setPositions: (id, positions) => http.put(`/users/${id}/positions`, { positions }),
  attachToOrg: (id, data) => http.post(`/users/${id}/org`, data),
  setBlocked: (id, isBlocked, reason = '') =>
    http.put(`/users/${id}/${isBlocked ? 'block' : 'unblock'}`, { isBlocked: true, reason })
}
