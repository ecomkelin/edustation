/**
 * StudentWork API - 作品
 * R-1600 list / R-1601 detail / R-1602 create / R-1670 me
 *
 * 2026-07-01 新增 me() — 家长看自家孩子作品，
 * x-active-student-id 由 request.js 自动注入。
 */
import { http } from './request'

export const studentWorkApi = {
  list(params = {}) {
    return http.get('/student-works', { data: params })
  },

  detail(id) {
    return http.get(`/student-works/${id}`)
  },

  create(data) {
    return http.post('/student-works', data)
  },

  update(id, data) {
    return http.patch(`/student-works/${id}`, data)
  },

  /**
   * R-1670 GET /student-works/me
   * C 端家长看自家孩子的全部作品
   */
  me(params = {}) {
    return http.get('/student-works/me', { data: params })
  }
}
