import http from './http'

export const positionApi = {
  catalog: () => http.get('/positions/permissions-catalog'),
  list: (params) => http.get('/positions', { params }),
  detail: (id) => http.get(`/positions/${id}`),
  create: (data) => http.post('/positions', data),
  update: (id, data) => http.put(`/positions/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/positions/${id}`, { data: { password } }),
  setPermissions: (id, permissions) => http.put(`/positions/${id}/permissions`, { permissions }),

  // 跨机构同步（仅平台超管）
  listSourceOrgs: (params) => http.get('/positions/source-orgs', { params }),
  listByOrg: (orgId) => http.get(`/positions/by-org/${orgId}`),
  sync: (payload) => http.post('/positions/sync', payload)
}
