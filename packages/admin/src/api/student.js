import http from './http'

export const studentApi = {
  list: (params) => http.get('/students', { params }),
  detail: (id) => http.get(`/students/${id}`),
  create: (data) => http.post('/students', data),
  update: (id, data) => http.put(`/students/${id}`, data),
  remove: (id) => http.delete(`/students/${id}`),
  setGuardians: (id, guardians) => http.put(`/students/${id}/guardians`, { guardians }),
  setBlocked: (id, isBlocked, reason = '') =>
    http.put(`/students/${id}/${isBlocked ? 'block' : 'unblock'}`, { isBlocked: true, reason }),
  me: () => http.get('/students/me')
}
