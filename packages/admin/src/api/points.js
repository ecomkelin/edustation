import http from './http'

export const pointsApi = {
  me: (params) => http.get('/points/me', { params }),
  earn: (data) => http.post('/points/earn', data),
  transactions: (params) => http.get('/points/transactions', { params })
}
