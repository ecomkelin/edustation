/**
 * StudentProduct API - 课包
 * R-1800 list (业务端) / R-1801 detail / R-1806 remaining
 * R-2079 me (C 端家长)
 */
import { http } from './request'

export const studentProductApi = {
  list(params = {}) {
    return http.get('/student-products', { data: params })
  },

  /** C 端: 当前 active child 的课包 */
  me(params = {}) {
    return http.get('/student-products/me', { data: params })
  },

  detail(id) {
    return http.get(`/student-products/${id}`)
  },

  remaining(id) {
    return http.get(`/student-products/${id}/remaining`)
  }
}