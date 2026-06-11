import http from '@/utils/request'

export const orderApi = {
  list: (params) => http.get('/orders', params),
  detail: (id) => http.get(`/orders/${id}`),
  // 家长端仅"创建订单 + 标记支付"两个写操作
  create: (data) => http.post('/orders', data),
  pay: (id, data) => http.post(`/orders/${id}/pay`, data),
  cancel: (id, data) => http.post(`/orders/${id}/cancel`, data)
}
