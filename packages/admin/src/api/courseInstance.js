import http from './http'

export const courseInstanceApi = {
  list: (params) => http.get('/course-instances', { params }),
  detail: (id) => http.get(`/course-instances/${id}`),
  create: (data) => http.post('/course-instances', data),
  update: (id, data) => http.put(`/course-instances/${id}`, data),
  // 状态变更：{ toStatus, reason }
  setStatus: (id, data) => http.put(`/course-instances/${id}/status`, data),
  // 软删（仅超管 + 仅 planning/cancelled 状态）
  remove: (id) => http.delete(`/course-instances/${id}`)
}
