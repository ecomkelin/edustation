/**
 * LessonAttendance API - 考勤
 * R-1500 list / R-1501 detail / R-1530 works / R-1536 me (C 端)
 *
 * 2026-07-01 新增 me() — 家长看自家孩子的考勤，
 * 默认 status 过滤为可上传作品的 (scheduled / completed / madeup / leave)。
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
  },

  /**
   * R-1536 GET /lesson-attendances/me
   * C 端家长看 active child 的考勤（选考勤上传作品）
   */
  me(params = {}) {
    return http.get('/lesson-attendances/me', { data: params })
  }
}