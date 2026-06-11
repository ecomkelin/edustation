import http from './http'

export const lessonAttendanceApi = {
  list: (params) => http.get('/lesson-attendances', { params }),
  checkIn: (data) => http.post('/lesson-attendances/check-in', data),
  // 「开课」批量登记：一次保存一节课所有学生的考勤状态
  bulkMark: (data) => http.post('/lesson-attendances/bulk-mark', data),
  complete: (id, data) => http.put(`/lesson-attendances/${id}/complete`, data),
  noShow: (id, data) => http.put(`/lesson-attendances/${id}/no-show`, data),
  // 结构化课评（仅 attendance.status='completed' 允许写入）
  updateEvaluation: (id, data) => http.put(`/lesson-attendances/${id}/evaluation`, data),
  works: (id) => http.get(`/lesson-attendances/${id}/works`),
  // 「补课」：为已结束/已归档排课的某条未消课考勤补建一条 completed记录
  // 返回 { attendance, studentProduct }：新考勤 + 扣减后的产品摘要
  makeup: (id, data) => http.post(`/lesson-attendances/${id}/makeup`, data || {})
}
