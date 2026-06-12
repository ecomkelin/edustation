import http from './http'

export const roomApi = {
  list: (params) => http.get('/rooms', { params }),
  detail: (id) => http.get(`/rooms/${id}`),
  create: (data) => http.post('/rooms', data),
  update: (id, data) => http.put(`/rooms/${id}`, data),
  // 误操删除（超管 + 二次密码 + 互锁检查 CourseInstance.room / LessonSchedule.room）
  remove: (id, { password } = {}) => http.delete(`/rooms/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/rooms/${id}/removable-check`)
}
