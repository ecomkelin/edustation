/**
 * Student API - 我的孩子 + 学习画像
 * R-0472 / R-0401 / R-0406
 */
import { http } from './request'

export const studentApi = {
  me(params = {}) {
    return http.get('/students/me', { data: params })
  },

  detail(id) {
    return http.get(`/students/${id}`)
  },

  profile(id) {
    return http.get(`/students/${id}/profile`)
  }
}