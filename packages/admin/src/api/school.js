import http from './http'

export const schoolApi = {
  list: (params) => http.get('/schools', { params }),
  detail: (id) => http.get(`/schools/${id}`),
  create: (data) => http.post('/schools', data),
  update: (id, data) => http.put(`/schools/${id}`, data),
  // 误操删除（超管 + 二次密码 + 互锁检查 Student.school）
  remove: (id, { password } = {}) => http.delete(`/schools/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/schools/${id}/removable-check`)
}
