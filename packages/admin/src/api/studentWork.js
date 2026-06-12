import http from './http'

export const studentWorkApi = {
  list: (params) => http.get('/student-works', { params }),
  detail: (id) => http.get(`/student-works/${id}`),
  upload: (formData) =>
    http.post('/student-works', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  // 员工编辑：title / description / fileUrls / level
  update: (id, payload) => http.patch(`/student-works/${id}`, payload),
  remove: (id, { password } = {}) => http.delete(`/student-works/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/student-works/${id}/removable-check`)
}
