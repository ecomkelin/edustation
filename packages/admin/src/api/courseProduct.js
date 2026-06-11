import http from './http'

export const courseProductApi = {
  list: (params) => http.get('/course-products', { params }),
  detail: (id) => http.get(`/course-products/${id}`),
  create: (data) => http.post('/course-products', data),
  update: (id, data) => http.put(`/course-products/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/course-products/${id}`, { data: { password } }),

  // 跨机构同步（仅平台超管）
  listSourceOrgs: (params) => http.get('/course-products/_sync/source-orgs', { params }),
  listByOrg: (orgId) => http.get(`/course-products/_sync/by-org/${orgId}`),
  sync: (payload) => http.post('/course-products/_sync', payload)
}
