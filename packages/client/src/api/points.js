/**
 * Points API - 积分 (C 端)
 * R-2000 transactions / R-2072 me / R-2060 earn
 */
import { http } from './request'

export const pointsApi = {
  // 2026-07-05: 接受 student 参数作为 query.student (request.js 会自动转 querystring)
  me(params = {}) {
    return http.get('/points/me', { data: params })
  },

  transactions(params = {}) {
    return http.get('/points/transactions', { data: params })
  },

  earn(data) {
    return http.post('/points/earn', data)
  }
}