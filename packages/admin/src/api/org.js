import http from './http'

export const orgApi = {
  list: (params) => http.get('/orgs', { params }),
  detail: (id) => http.get(`/orgs/${id}`),
  create: (data) => http.post('/orgs', data),
  update: (id, data) => http.put(`/orgs/${id}`, data),
  remove: (id) => http.delete(`/orgs/${id}`),
  toggleActive: (id, password) => http.post(`/orgs/${id}/toggle-active`, { password }),
  candidatePrincipals: (id) => http.get(`/orgs/${id}/candidate-principals`)
}
