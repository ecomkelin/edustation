/**
 * StudentWork API - 作品
 * R-1600 list / R-1601 detail / R-1602 create
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
  }
}