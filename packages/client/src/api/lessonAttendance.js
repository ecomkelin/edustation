import http from '@/utils/request'

export const lessonAttendanceApi = {
  list: (params) => http.get('/lesson-attendances', params),
  detail: (id) => http.get(`/lesson-attendances/${id}`),
  // 家长端不直接调这些写操作（消课由老师在 admin 端操作）；
  // 这里保留详情/列表入口供家长查看考勤记录
  works: (id) => http.get(`/lesson-attendances/${id}/works`)
}
