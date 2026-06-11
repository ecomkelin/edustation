import http from './http'

export const courseEnrollmentApi = {
  list: (params) => http.get('/course-enrollments', { params }),
  detail: (id) => http.get(`/course-enrollments/${id}`),
  create: (data) => http.post('/course-enrollments', data),
  update: (id, data) => http.put(`/course-enrollments/${id}`, data),
  setStatus: (id, data) => http.put(`/course-enrollments/${id}/status`, data),
  // 误操删除(仅超管):需要在 body 里带 password 二次确认
  remove: (id, { password } = {}) => http.delete(`/course-enrollments/${id}`, { data: { password } })
}
