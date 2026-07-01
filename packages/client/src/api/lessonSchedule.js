/**
 * LessonSchedule API - 课表
 * R-1450 calendar (业务端) / R-1400 list / R-1401 detail
 * R-1492 me/calendar (C 端家长)
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
  },

  /** C 端: 当前 active child 的课表 */
  myCalendar(params = {}) {
    return http.get('/lesson-schedules/me/calendar', { data: params })
  }
}