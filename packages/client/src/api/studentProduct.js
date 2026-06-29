/**
 * StudentProduct API - 课包
 * R-1800 list / R-1801 detail / R-1806 remaining
 */
import { http } from './request'

export const studentProductApi = {
  list(params = {}) {
    return http.get('/student-products', { data: params })
  },

  detail(id) {
    return http.get(`/student-products/${id}`)
  },

  remaining(id) {
    return http.get(`/student-products/${id}/remaining`)
  }
}