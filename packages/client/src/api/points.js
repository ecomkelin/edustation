import http from '@/utils/request'

export const pointsApi = {
  me: () => http.get('/points/me'),
  // 内部触发入账（分享/签到）；家长端不直接调，但留作 future use
  earn: (data) => http.post('/points/earn', data),
  transactions: (params) => http.get('/points/transactions', params)
}
