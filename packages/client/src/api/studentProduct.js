import http from '@/utils/request'

export const studentProductApi = {
  // 家长端查自己孩子的所有课包
  list: (params) => http.get('/student-products', params),
  detail: (id) => http.get(`/student-products/${id}`),
  // 轻量"剩余课时"轮询接口（首页顶部"剩余 X 课时"卡片）
  remaining: (id) => http.get(`/student-products/${id}/remaining`)
}
