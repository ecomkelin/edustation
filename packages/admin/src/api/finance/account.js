import http from '../http'

/**
 * 财务账本 API (admin 端, 2026-06-25 立项)
 *
 * 后端基础路径: /api/v1/finance
 *
 *   - list             : 账本列表 (分页 + 搜索 + 类型/启用过滤)
 *   - getPrimary       : 默认账本 (isPrimary=true)
 *   - detail           : 账本详情 + 最近 10 笔流水
 *   - create           : 新建账本
 *   - update           : 更新账本 (白名单字段)
 *   - remove           : 物理删除 (requirePlatformPassword)
 *   - removableCheck   : 删除预检
 */
export const financeAccountApi = {
  list: (params) => http.get('/finance/accounts', { params }),
  getPrimary: () => http.get('/finance/accounts/primary'),
  detail: (id) => http.get(`/finance/accounts/${id}`),
  create: (data) => http.post('/finance/accounts', data),
  update: (id, data) => http.put(`/finance/accounts/${id}`, data),
  // 物理删除（超管 + 二次密码 + 互锁检查 FinanceTransaction.account）
  remove: (id, { password } = {}) => http.delete(`/finance/accounts/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/finance/accounts/${id}/removable-check`)
}
