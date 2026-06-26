import http from './http'

export const orderApi = {
  list: (params) => http.get('/orders', { params }),
  detail: (id) => http.get(`/orders/${id}`),
  // 员工线下收款：传 paymentMethod + paidAmount 时，原子地标 paid 并按 items 逐项创建 StudentProduct
  create: (data) => http.post('/orders', data),
  pay: (id, data) => http.post(`/orders/${id}/pay`, data),
  // 退款 (R-1722 2026-06-25): 部分退款支持; 复用 order.pay 权限; amount + reason 必填
  // 累计退完自动转 refunded; 联动 StudentProduct 软停用
  refund: (id, data) => http.post(`/orders/${id}/refund`, data),
  cancel: (id, data) => http.post(`/orders/${id}/cancel`, data),
  // 物理删除 (2026-06-25): 超管+密码确认, 互锁检查 StudentProduct.order; 业务硬门挡 paid/refunded
  remove: (id, { password } = {}) => http.delete(`/orders/${id}`, { data: { password } }),
  // 删除预检: 删除按钮触发前先弹挡板说明
  removableCheck: (id) => http.get(`/orders/${id}/removable-check`)
}
