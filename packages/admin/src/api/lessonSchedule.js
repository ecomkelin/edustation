import http from './http'

export const lessonScheduleApi = {
  // 列表 / 详情
  list: (params) => http.get('/lesson-schedules', { params }),
  detail: (id) => http.get(`/lesson-schedules/${id}`),
  // FullCalendar 用
  calendar: (params) => http.get('/lesson-schedules/calendar', { params }),
  // 冲突预检
  checkConflicts: (params) => http.get('/lesson-schedules/conflicts', { params }),
  // 单条 CRUD
  create: (data) => http.post('/lesson-schedules', data),
  update: (id, data) => http.put(`/lesson-schedules/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/lesson-schedules/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/lesson-schedules/${id}/removable-check`),
  // 批量：preview (不入库) / generate (入库)
  preview: (data) => http.post('/lesson-schedules/preview', data),
  generate: (data) => http.post('/lesson-schedules/generate', data),
  // 实际上课时间
  start: (id) => http.post(`/lesson-schedules/${id}/start`),
  finish: (id, data) => http.post(`/lesson-schedules/${id}/finish`, data || {}),
  // 准备上课：scheduled → preparing（仅 24h 窗口内可转）
  prepare: (id) => http.post(`/lesson-schedules/${id}/prepare`),
  // 归档（已完成 → 已归档；要求所有非 no_show/leave 的考勤都完成课评）
  archive: (id) => http.post(`/lesson-schedules/${id}/archive`),
  // 「补齐名单」：为该排课补建尚未生成考勤的已报名学生（修 prepare 之后报名漏生成考勤的 bug）
  syncAttendances: (id) => http.post(`/lesson-schedules/${id}/sync-attendances`),
  // 「补齐名单」预览：返回 { toCreate }，UI 用此决定按钮显隐与徽标数字
  previewSyncAttendances: (id) => http.get(`/lesson-schedules/${id}/sync-attendances/preview`)
}
