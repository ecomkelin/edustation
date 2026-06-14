import http from './http'

export const studentWorkApi = {
  list: (params) => http.get('/student-works', { params }),
  detail: (id) => http.get(`/student-works/${id}`),
  /**
   * 创建作品。文件先经 /storage/upload-many?scope=work 上传后拿到 fileIds，
   * 再以 JSON 形式调本端点。
   * 入参：{ lessonAttendance, title, fileIds: [id...], description?, level? }
   */
  create: (payload) => http.post('/student-works', payload),
  // 员工编辑：title / description / fileUrls / level
  update: (id, payload) => http.patch(`/student-works/${id}`, payload),
  remove: (id, { password } = {}) => http.delete(`/student-works/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/student-works/${id}/removable-check`)
}
