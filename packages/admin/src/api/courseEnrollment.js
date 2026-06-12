import http from './http'

export const courseEnrollmentApi = {
  list: (params) => http.get('/course-enrollments', { params }),
  detail: (id) => http.get(`/course-enrollments/${id}`),
  create: (data) => http.post('/course-enrollments', data),
  update: (id, data) => http.put(`/course-enrollments/${id}`, data),
  setStatus: (id, data) => http.put(`/course-enrollments/${id}/status`, data),
  // 误操删除(超管 + 二次密码 + 仅 enrolled 状态)
  remove: (id, { password } = {}) => http.delete(`/course-enrollments/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/course-enrollments/${id}/removable-check`)
}
