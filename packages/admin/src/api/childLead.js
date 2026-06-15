import http from './http'

/**
 * 招生试听 - 孩子潜客 (ChildLead) API
 *
 * 2026-06 重构: 替代原 leadApi 的大部分
 *   - 单创建需 parentId (走 POST /child-leads)
 *   - 编辑基础信息
 *   - 触点日志
 *   - 撤销转化 (5 分钟内)
 */
export const childLeadApi = {
  list: (params) => http.get('/child-leads', { params }),
  detail: (id) => http.get(`/child-leads/${id}`),
  create: (data) => http.post('/child-leads', data),
  update: (id, data) => http.put(`/child-leads/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/child-leads/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/child-leads/${id}/removable-check`),

  // 触点
  listActivities: (id) => http.get(`/child-leads/${id}/activities`),
  createActivity: (id, data) => http.post(`/child-leads/${id}/activities`, data),
  // 编辑触点 (自己 24h / 超管)
  updateActivity: (id, actId, data) => http.put(`/child-leads/${id}/activities/${actId}`, data),
  // 物理删触点 (超管 + 密码, 无软删)
  removeActivity: (id, actId, { password } = {}) =>
    http.delete(`/child-leads/${id}/activities/${actId}`, { data: { password } }),

  // 撤销转化 (5 分钟内)
  unconvert: (id) => http.post(`/child-leads/${id}/unconvert`)
}
