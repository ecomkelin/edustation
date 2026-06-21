import http from './http'

/**
 * 招生试听 - 试听预约 (TrialBooking) API
 *
 * 核心流程:
 *   1. for-child: 为已有 childLead 建一笔 awaiting_schedule 预约
 *   2. batch-schedule: 教务在"待约"tab 多选 booking → 选时间/老师/教室
 *   3. check-in: 销售/教务到店打卡 (status=arrived)
 *   4. complete: 填 result (是否报名 + 原因 + 谈单老师 + 吸引点)
 *   5. convert-preview → convert: 转化 (claim token + upsert 链)
 *   6. (2026-06-16) 已约态的精细调整: reschedule-time 改时间 / revert-to-unscheduled 退回未约
 *
 * 2026-06-21 调整:
 *   - 删 create (attached 跟班): 试听课完全独立于排课系统
 *   - 谈单老师走顶级 consultant 字段 (替代 result.negotiateTeacher)
 */
export const trialBookingApi = {
  list: (params) => http.get('/trial-bookings', { params }),
  detail: (id) => http.get(`/trial-bookings/${id}`),

  // 2026-06-20: 为已有 childLead 单独创建一笔 awaiting_schedule 预约 (solo, 不排时间)
  //   场景: 取消后再约 / 已转化想再试另一门 / 录入时漏了某个科目
  //   data: { preStudent, subject?, remark? }
  //   返回: 完整 TrialBooking 对象, 走完后可继续调 batchSchedule 排课
  createForChild: (data) => http.post('/trial-bookings/for-child', data),

  update: (id, data) => http.put(`/trial-bookings/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/trial-bookings/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/trial-bookings/${id}/removable-check`),

  // 批量排课 (核心)
  batchSchedule: (data) => http.post('/trial-bookings/batch-schedule', data),

  // 到店打卡
  checkIn: (id, data) => http.post(`/trial-bookings/${id}/check-in`, data),

  // 完成 (填 result)
  complete: (id, data) => http.post(`/trial-bookings/${id}/complete`, data),

  // 改预约时间 (2026-06-16 替代 markNoShow+reschedule; 仅 scheduled 可用)
  // data: { plannedStartTime, plannedEndTime, teacher, room } - 至少给一个字段
  rescheduleTime: (id, data) => http.post(`/trial-bookings/${id}/reschedule-time`, data || {}),

  // 退回未约 (scheduled → awaiting_schedule; 2026-06-16 新增)
  revertToUnscheduled: (id) => http.post(`/trial-bookings/${id}/revert-to-unscheduled`),

  // 取消后再约一次 (cancelled → 新 awaiting_schedule + batchSchedule; 2026-06-16 新增)
  // data: { plannedStartTime, plannedEndTime, teacher, room? }
  rescheduleFromCancelled: (id, data) => http.post(`/trial-bookings/${id}/reschedule-from-cancelled`, data),

  // 转化两步式
  convertPreview: (id) => http.post(`/trial-bookings/${id}/convert-preview`),
  convert: (id) => http.post(`/trial-bookings/${id}/convert`)
}
