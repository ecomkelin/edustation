/**
 * LessonSchedule API - 课表
 * R-1450 calendar / R-1400 list / R-1401 detail
 */
import { http } from './request'

export const lessonScheduleApi = {
  list(params = {}) {
    return http.get('/lesson-schedules', { data: params })
  },

  detail(id) {
    return http.get(`/lesson-schedules/${id}`)
  },

  calendar(params = {}) {
    return http.get('/lesson-schedules/calendar', { data: params })
  }
}