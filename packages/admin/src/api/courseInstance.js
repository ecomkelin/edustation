import http from './http'

export const courseInstanceApi = {
  list: (params) => http.get('/course-instances', { params }),
  // 2026-07-08: 归档 tab 跳详情要 includeArchived=true 拿到已软删的开班
  detail: (id, { includeArchived } = {}) => http.get(`/course-instances/${id}`, { params: includeArchived ? { includeArchived: 'true' } : {} }),
  create: (data) => http.post('/course-instances', data),
  update: (id, data) => http.put(`/course-instances/${id}`, data),
  // 状态变更：{ toStatus, reason }
  setStatus: (id, data) => http.put(`/course-instances/${id}/status`, data),
  // 软删（超管 + 二次密码 + 互锁检查 + 仅 planning/cancelled 状态）
  remove: (id, { password } = {}) => http.delete(`/course-instances/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/course-instances/${id}/removable-check`),
  // 2026-07-08: 取消归档 (从已软删恢复) — 高风险, 仍需超管+密码
  recover: (id, { password } = {}) => http.post(`/course-instances/${id}/recover`, { password })
}
