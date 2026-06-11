import http from './http'

export const subjectApi = {
  list: (params) => http.get('/subjects', { params }),
  detail: (id) => http.get(`/subjects/${id}`),
  create: (data) => http.post('/subjects', data),
  update: (id, data) => http.put(`/subjects/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/subjects/${id}`, { data: { password } }),

  // 跨机构同步（仅平台超管）
  listSourceOrgs: (params) => http.get('/subjects/source-orgs', { params }),
  listByOrg: (orgId) => http.get(`/subjects/by-org/${orgId}`),
  sync: (payload) => http.post('/subjects/sync', payload)
}
