import http from './http'

export const studentProductApi = {
  list: (params) => http.get('/student-products', { params }),
  detail: (id) => http.get(`/student-products/${id}`),
  remaining: (id) => http.get(`/student-products/${id}/remaining`),
  // 员工赠课：绕过订单直接创建 StudentProduct，需 studentProduct.gift 权限
  gift: (data) => http.post('/student-products/gift', data),
  // 物理删除 (2026-06-25): 超管+密码确认, 互锁检查 LessonAttendance.studentProduct + CourseEnrollment.studentProduct
  remove: (id, { password } = {}) => http.delete(`/student-products/${id}`, { data: { password } }),
  // 删除预检: 删除按钮触发前先弹挡板说明
  removableCheck: (id) => http.get(`/student-products/${id}/removable-check`)
}
