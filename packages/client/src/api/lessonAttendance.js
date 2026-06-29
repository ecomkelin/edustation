/**
 * LessonAttendance API - 考勤
 * R-1500 list / R-1501 detail (推测) / R-1530 works
 */
import { http } from './request'

export const lessonAttendanceApi = {
  list(params = {}) {
    return http.get('/lesson-attendances', { data: params })
  },

  detail(id) {
    return http.get(`/lesson-attendances/${id}`)
  },

  works(id) {
    return http.get(`/lesson-attendances/${id}/works`)
  }
}