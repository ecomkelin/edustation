import http from './http'

/**
 * Pet Catalog Admin API（2026-06-21 pet-system-v2-ext）
 *
 * 三个 catalog 的 CRUD API 客户端：
 *   - species:     GET/POST/PUT/DELETE /admin/pet/species[/:id]
 *   - items:       GET/POST/PUT/DELETE /admin/pet/items[/:id]
 *   - consumables: GET/POST/PUT/DELETE /admin/pet/consumables[/:id]
 *
 * 响应约定：http 拦截器已 return body.data，所以返回值直接是业务 data 字段。
 * 例如：petCatalogApi.listSpecies() → Promise<{ items: [...] }>
 */

export const petCatalogApi = {
  // ─── Species ───
  listSpecies: (params) => http.get('/admin/pet/species', { params }),
  getSpecies: (id) => http.get(`/admin/pet/species/${id}`),
  createSpecies: (data) => http.post('/admin/pet/species', data),
  updateSpecies: (id, data) => http.put(`/admin/pet/species/${id}`, data),
  removeSpecies: (id, { password } = {}) => http.delete(`/admin/pet/species/${id}`, { data: { password } }),
  removableCheckSpecies: (id) => http.get(`/admin/pet/species/${id}/removable-check`),

  // ─── Consumables ───
  listConsumables: (params) => http.get('/admin/pet/consumables', { params }),
  getConsumable: (id) => http.get(`/admin/pet/consumables/${id}`),
  createConsumable: (data) => http.post('/admin/pet/consumables', data),
  updateConsumable: (id, data) => http.put(`/admin/pet/consumables/${id}`, data),
  removeConsumable: (id, { password } = {}) => http.delete(`/admin/pet/consumables/${id}`, { data: { password } }),
  removableCheckConsumable: (id) => http.get(`/admin/pet/consumables/${id}/removable-check`),

  // ─── Level Config（per-org 等级配置，2026-07-15） ───
  getLevelConfig: () => http.get('/admin/pet/level-config'),
  updateLevelConfig: (data) => http.put('/admin/pet/level-config', data)
}