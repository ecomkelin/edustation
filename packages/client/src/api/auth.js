import http from '@/utils/request'

export const authApi = {
  login: (data) => http.post('/auth/login', data),
  refresh: () => http.post('/auth/refresh'),
  logout: () => http.post('/auth/logout'),
  me: () => http.get('/auth/me')
}
