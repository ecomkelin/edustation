import http from './http'

/**
 * 招生试听 - 潜客 (Lead) API
 *
 * 软唯一: create 命中既有 lead 时, 返回 { duplicate: true, lead: <existing> }, 不报错
 *   - 前端看到 duplicate=true 时弹"该手机号已存在"提示, [查看] 打开既有
 *
 * 触点日志: listActivities 拉时间线; createActivity 记录, 同步更新 lastContactedAt
 *
 * 撤销转化: unconvert 在 5 分钟窗口内可调, 业务上认账后不能再撤
 */
export const leadApi = {
  list: (params) => http.get('/leads', { params }),
  detail: (id) => http.get(`/leads/${id}`),
  create: (data) => http.post('/leads', data),
  update: (id, data) => http.put(`/leads/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/leads/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/leads/${id}/removable-check`),

  // 触点时间线
  listActivities: (id) => http.get(`/leads/${id}/activities`),
  createActivity: (id, data) => http.post(`/leads/${id}/activities`, data),

  // 撤销转化 (5 分钟内)
  unconvert: (id) => http.post(`/leads/${id}/unconvert`)
}
