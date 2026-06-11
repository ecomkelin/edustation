import http from './http'

export const roomApi = {
  list: (params) => http.get('/rooms', { params }),
  detail: (id) => http.get(`/rooms/${id}`),
  create: (data) => http.post('/rooms', data),
  update: (id, data) => http.put(`/rooms/${id}`, data),
  remove: (id) => http.delete(`/rooms/${id}`)
}
