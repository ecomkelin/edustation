/**
 * LessonSchedule API - 课表
 * R-1450 calendar (业务端) / R-1400 list / R-1401 detail
 * R-1492 me/calendar (C 端家长)
 * R-1493 me/by-instance/:id (C 端开班详情-我的考勤)
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
  },

  /**
   * C 端: 当前 active child 在某开班下的排课+考勤列表
   * 2026-07-04 加 (R-1493) — 给 instance-detail.vue 的"考勤记录" section 用
   * @returns {Promise<Array<{id, lessonNo, plannedStartTime, plannedEndTime, status,
   *                          teacher, room, attendance: {id,status,...}|null}>>}
   */
  byInstance(courseInstanceId) {
    return http.get(`/lesson-schedules/me/by-instance/${courseInstanceId}`)
  }
}