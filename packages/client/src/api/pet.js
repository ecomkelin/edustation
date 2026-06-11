import http from '@/utils/request'

export const petApi = {
  me: () => http.get('/pet/me'),
  feed: (data) => http.post('/pet/feed', data)
}
