import http from './http'

export const orgApi = {
  list: (params) => http.get('/orgs', { params }),
  detail: (id) => http.get(`/orgs/${id}`),
  create: (data) => http.post('/orgs', data),
  update: (id, data) => http.put(`/orgs/${id}`, data),
  // 机构不允许物理删除——请用 toggleActive 启用/停用。
  toggleActive: (id, password) => http.post(`/orgs/${id}/toggle-active`, { password }),
  candidatePrincipals: (id) => http.get(`/orgs/${id}/candidate-principals`)
}
