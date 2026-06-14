import http from './http'

/**
 * 招生试听 - 试听预约 (TrialBooking) API
 *
 * 核心流程:
 *   1. batch-schedule: 教务在"待约"tab 多选 booking → 选时间/老师/教室 → 一次性创建 1 个 LessonSchedule
 *   2. check-in: 销售/教务到店打卡 (status=arrived)
 *   3. complete: 填 result (是否报名 + 原因 + 谈单老师 + 吸引点)
 *   4. convert-preview → convert: 转化 (claim token + upsert 链)
 *   5. reschedule: no_show 后再约一次 (内部走 batch-schedule)
 */
export const trialBookingApi = {
  list: (params) => http.get('/trial-bookings', { params }),
  detail: (id) => http.get(`/trial-bookings/${id}`),
  // 单笔跟班 (attached)
  create: (data) => http.post('/trial-bookings', data),
  update: (id, data) => http.put(`/trial-bookings/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/trial-bookings/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/trial-bookings/${id}/removable-check`),

  // 批量排课 (核心)
  batchSchedule: (data) => http.post('/trial-bookings/batch-schedule', data),

  // 到店打卡
  checkIn: (id, data) => http.post(`/trial-bookings/${id}/check-in`, data),

  // 完成 (填 result)
  complete: (id, data) => http.post(`/trial-bookings/${id}/complete`, data),

  // 再约一次 (no_show)
  reschedule: (id, data) => http.post(`/trial-bookings/${id}/reschedule`, data),

  // 转化两步式
  convertPreview: (id) => http.post(`/trial-bookings/${id}/convert-preview`),
  convert: (id) => http.post(`/trial-bookings/${id}/convert`)
}
