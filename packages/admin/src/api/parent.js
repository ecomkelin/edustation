import http from './http'

/**
 * 招生试听 - 家长账户 (Parent) API
 *
 * 2026-06 重构: 替代原 leadApi, 引入 Parent + ChildLead 二分
 *
 * 核心:
 *   - withChild: 1 API 创建 Parent + 1 ChildLead + N TrialBooking (软唯一命中返回 duplicate=true)
 *   - children: 同家长加孩
 *   - tags: 标签管理 (套 Category 字典 model='LeadTag')
 *   - recomputeLifecycle: 手动重算 lifecycle
 *
 * 触点: listActivities 拉时间线 (聚合该家长下所有孩子的触点)
 * 撤销转化: 改走 childLeadApi.unconvert(:childLeadId)
 */
export const parentApi = {
  list: (params) => http.get('/parents', { params }),
  detail: (id) => http.get(`/parents/${id}`),
  /**
   * 创建家长 + 第一个孩子
   * 软唯一命中 → 返回 { duplicate: true, parent }, 不报错
   * 成功 → 201 + { duplicate: false, parent, childLead }
   */
  withChild: (data) => http.post('/parents/with-child', data),
  update: (id, data) => http.put(`/parents/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/parents/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/parents/${id}/removable-check`),

  // 同家长加孩
  addChild: (id, data) => http.post(`/parents/${id}/children`, data),
  // 手动重算 lifecycle
  recomputeLifecycle: (id) => http.post(`/parents/${id}/recompute-lifecycle`),

  // 触点时间线 (聚合该家长下所有孩子的触点)
  listActivities: (id) => http.get(`/parents/${id}/activities`),

  // 标签
  addTag: (id, tagId) => http.post(`/parents/${id}/tags`, { tagId }),
  removeTag: (id, tagId) => http.delete(`/parents/${id}/tags/${tagId}`),

  // 家长沟通画像 (2026-06 新增) — 挂在 UserOrgRel 上, 跨机构独立
  getProfile: (id) => http.get(`/parents/${id}/profile`),
  setProfile: (id, data) => http.put(`/parents/${id}/profile`, data)
}
