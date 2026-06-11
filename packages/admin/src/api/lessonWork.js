import http from './http'

export const lessonWorkApi = {
  list: (params) => http.get('/lesson-works', { params }),
  upload: (formData) =>
    http.post('/lesson-works', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  remove: (id, { password } = {}) => http.delete(`/lesson-works/${id}`, { data: { password } })
}
