/**
 * CourseProduct API - 课程产品
 * R-1000 list / R-1001 detail
 */
import { http } from './request'

export const courseProductApi = {
  list(params = {}) {
    return http.get('/course-products', { data: params })
  },

  detail(id) {
    return http.get(`/course-products/${id}`)
  }
}