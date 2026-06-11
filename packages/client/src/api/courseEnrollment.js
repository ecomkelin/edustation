import http from '@/utils/request'

export const courseEnrollmentApi = {
  // 家长查自己孩子的报名
  list: (params) => http.get('/course-enrollments', params),
  detail: (id) => http.get(`/course-enrollments/${id}`),
  // 家长端：报名
  create: (data) => http.post('/course-enrollments', data),
  // 退班/休学
  changeStatus: (id, data) => http.put(`/course-enrollments/${id}/status`, data)
}
