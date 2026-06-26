import http from '../http'

/**
 * 财务原因字典 API (admin 端, 2026-06-25 立项)
 *
 * 字典复用 Category(model='FinanceReason'), 后端走 /api/v1/finance/reasons
 *
 *   - list            : 字典列表 (按 direction/isActive 过滤)
 *   - create          : 新建字典
 *   - update          : 更新字典
 *   - remove          : 物理删除 (requirePlatformPassword + 互锁 FinanceTransaction.reason)
 *   - removableCheck  : 删除预检
 */
export const financeReasonApi = {
  list: (params) => http.get('/finance/reasons', { params }),
  create: (data) => http.post('/finance/reasons', data),
  update: (id, data) => http.put(`/finance/reasons/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/finance/reasons/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/finance/reasons/${id}/removable-check`)
}
