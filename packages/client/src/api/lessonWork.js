import http from '@/utils/request'

export const lessonWorkApi = {
  // 家长端：按孩子列作品
  list: (params) => http.get('/lesson-works', params),
  // 上传作品（家长可上传孩子课外作品或老师布置的）
  upload: (formData) =>
    http.post('/lesson-works', formData, {
      header: { 'Content-Type': 'multipart/form-data' }
    }),
  remove: (id) => http.delete(`/lesson-works/${id}`)
}
