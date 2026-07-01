/**
 * Order API - 订单
 * R-1700 list (业务端) / R-1701 detail / R-1721 pay / R-1722 refund / R-1723 cancel
 * R-2078 me (C 端家长)
 */
import { http } from './request'

export const orderApi = {
  list(params = {}) {
    return http.get('/orders', { data: params })
  },

  /** C 端: 当前 active child 的订单 */
  me(params = {}) {
    return http.get('/orders/me', { data: params })
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