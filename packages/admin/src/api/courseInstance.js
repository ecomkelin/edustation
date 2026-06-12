import http from './http'

export const courseInstanceApi = {
  list: (params) => http.get('/course-instances', { params }),
  detail: (id) => http.get(`/course-instances/${id}`),
  create: (data) => http.post('/course-instances', data),
  update: (id, data) => http.put(`/course-instances/${id}`, data),
  // 状态变更：{ toStatus, reason }
  setStatus: (id, data) => http.put(`/course-instances/${id}/status`, data),
  // 软删（超管 + 二次密码 + 互锁检查 + 仅 planning/cancelled 状态）
  remove: (id, { password } = {}) => http.delete(`/course-instances/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/course-instances/${id}/removable-check`)
}
