/**
 * Points API - 积分 (C 端)
 * R-2000 transactions / R-2072 me / R-2060 earn
 */
import { http } from './request'

export const pointsApi = {
  me() {
    return http.get('/points/me')
  },

  transactions(params = {}) {
    return http.get('/points/transactions', { data: params })
  },

  earn(data) {
    return http.post('/points/earn', data)
  }
}