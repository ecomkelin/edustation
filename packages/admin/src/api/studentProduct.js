import http from './http'

export const studentProductApi = {
  list: (params) => http.get('/student-products', { params }),
  detail: (id) => http.get(`/student-products/${id}`),
  remaining: (id) => http.get(`/student-products/${id}/remaining`),
  // 员工赠课：绕过订单直接创建 StudentProduct，需 studentProduct.gift 权限
  gift: (data) => http.post('/student-products/gift', data)
}
