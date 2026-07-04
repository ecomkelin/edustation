/**
 * CourseInstance API - 开班
 * R-1100 list / R-1101 detail / R-1101A me (C 端开班详情,绕过 courseInstance.read 权限码)
 */
import { http } from './request'

export const courseInstanceApi = {
  list(params = {}) {
    return http.get('/course-instances', { data: params })
  },

  detail(id) {
    return http.get(`/course-instances/${id}`)
  },

  // 2026-07-04 加: C 端开班详情 (instance-detail.vue 调用, 跳过 courseInstance.read 权限码)
  // 后端 mws.activeStudent 自动校验 activeStudent 是该开班报名学生 (允许回看退班/已结课)
  // ref: [memory: c-end-me-endpoint-pattern]
  me(id) {
    return http.get(`/course-instances/${id}/me`)
  }
}