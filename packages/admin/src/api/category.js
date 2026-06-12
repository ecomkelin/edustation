import http from './http'

export const categoryApi = {
  list: (params) => http.get('/categories', { params }),
  tree: (params) => http.get('/categories/tree', { params }),
  detail: (id) => http.get(`/categories/${id}`),
  create: (data) => http.post('/categories', data),
  update: (id, data) => http.put(`/categories/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/categories/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/categories/${id}/removable-check`)
}
