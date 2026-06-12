import http from './http'

export const courseProductApi = {
  list: (params) => http.get('/course-products', { params }),
  detail: (id) => http.get(`/course-products/${id}`),
  create: (data) => http.post('/course-products', data),
  update: (id, data) => http.put(`/course-products/${id}`, data),
  // 物理删除：超管+密码；互锁检查 Order.items[].courseProduct / StudentProduct.courseProduct
  remove: (id, { password } = {}) => http.delete(`/course-products/${id}`, { data: { password } }),
  // 预检：删除按钮触发前先调，看能否删
  removableCheck: (id) => http.get(`/course-products/${id}/removable-check`),

  // 跨机构同步（仅平台超管）
  listSourceOrgs: (params) => http.get('/course-products/_sync/source-orgs', { params }),
  listByOrg: (orgId) => http.get(`/course-products/_sync/by-org/${orgId}`),
  sync: (payload) => http.post('/course-products/_sync', payload)
}
