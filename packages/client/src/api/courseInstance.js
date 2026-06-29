/**
 * CourseInstance API - 开班
 * R-1100 list / R-1101 detail
 */
import { http } from './request'

export const courseInstanceApi = {
  list(params = {}) {
    return http.get('/course-instances', { data: params })
  },

  detail(id) {
    return http.get(`/course-instances/${id}`)
  }
}