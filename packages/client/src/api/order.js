/**
 * Order API - 订单
 * R-1700 list / R-1701 detail / R-1721 pay / R-1722 refund / R-1723 cancel
 */
import { http } from './request'

export const orderApi = {
  list(params = {}) {
    return http.get('/orders', { data: params })
  },

  detail(id) {
    return http.get(`/orders/${id}`)
  },

  pay(id, data = {}) {
    return http.post(`/orders/${id}/pay`, data)
  },

  refund(id, data) {
    return http.post(`/orders/${id}/refund`, data)
  },

  cancel(id) {
    return http.post(`/orders/${id}/cancel`)
  }
}