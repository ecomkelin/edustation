/**
 * CourseEnrollment API - 课程报名
 * R-1200 list / R-1201 detail / R-1202 create / R-1213 status / R-1214 me
 */
import { http } from './request'

export const courseEnrollmentApi = {
  list(params = {}) {
    return http.get('/course-enrollments', { data: params })
  },

  // R-1214: C 端 "我的报名" (走 activeStudent 中间件, 排除 withdrawn)
  me(params = {}) {
    return http.get('/course-enrollments/me', { data: params })
  },

  // R-1215: C 端 "单课进度" (学生维度的已上/计划总/剩余/最近考勤)
  myProgress(courseInstanceId, params = {}) {
    return http.get(`/course-enrollments/me/by-instance/${courseInstanceId}`, { data: params })
  },

  detail(id) {
    return http.get(`/course-enrollments/${id}`)
  },

  create(data) {
    return http.post('/course-enrollments', data)
  },

  setStatus(id, status, remark) {
    return http.put(`/course-enrollments/${id}/status`, { status, remark })
  }
}