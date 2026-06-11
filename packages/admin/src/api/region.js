import http from './http'

export const regionApi = {
  list: (params) => http.get('/regions', { params }),
  tree: () => http.get('/regions/tree'),
  detail: (id) => http.get(`/regions/${id}`),
  create: (data) => http.post('/regions', data),
  update: (id, data) => http.put(`/regions/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/regions/${id}`, { data: { password } })
}
