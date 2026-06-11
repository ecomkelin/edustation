import http from './http'

export const orderApi = {
  list: (params) => http.get('/orders', { params }),
  detail: (id) => http.get(`/orders/${id}`),
  // 员工线下收款：传 paymentMethod + paidAmount 时，原子地标 paid 并按 items 逐项创建 StudentProduct
  create: (data) => http.post('/orders', data),
  pay: (id, data) => http.post(`/orders/${id}/pay`, data),
  cancel: (id, data) => http.post(`/orders/${id}/cancel`, data)
}
