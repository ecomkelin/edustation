import http from './http'

export const petApi = {
  me: (params) => http.get('/pet/me', { params }),
  feed: (data) => http.post('/pet/feed', data)
}
