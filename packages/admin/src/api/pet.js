import http from './http'

/**
 * Pet admin API（2026-06-21 pet-system-v2 + pet-system-v2-ext 2026-06-21）
 *
 * 包含：
 *   - 宠物实例：list / get / update / events
 *   - 老师/admin 代操作 6 端点：adoptOnBehalf / feedOnBehalf / hatchOnBehalf / swapEggOnBehalf / tierDownOnBehalf / equipOnBehalf
 *   - 课堂展示用：getByStudent
 *
 * 响应约定：http 拦截器已 return body.data，所以返回值直接是业务 data 字段。
 */
export const petAdminApi = {
  // ─── 宠物实例 ───
  list: (params) => http.get('/admin/pet/accounts', { params }),
  get: (id) => http.get(`/admin/pet/accounts/${id}`),
  update: (id, data) => http.put(`/admin/pet/accounts/${id}`, data),
  events: (params) => http.get('/admin/pet/events', { params }),

  // ─── 代操作 6 端点 ───
  adoptOnBehalf: (studentId) => http.post('/admin/pet/accounts', { studentId }),
  feedOnBehalf: (petAccountId, { consumableKey }) => http.post(`/admin/pet/accounts/${petAccountId}/feed`, { consumableKey }),
  hatchOnBehalf: (petAccountId) => http.post(`/admin/pet/accounts/${petAccountId}/hatch`),
  swapEggOnBehalf: (petAccountId) => http.post(`/admin/pet/accounts/${petAccountId}/swap-egg`),
  tierDownOnBehalf: (petAccountId, { targetTier }) => http.post(`/admin/pet/accounts/${petAccountId}/tier-down`, { targetTier }),
  equipOnBehalf: (petAccountId, { slot, itemKey }) => http.post(`/admin/pet/accounts/${petAccountId}/equip`, { slot, itemKey }),

  // ─── 课堂展示 ───
  getByStudent: (studentId) => http.get('/admin/pet/accounts-by-student', { params: { studentId } })
}