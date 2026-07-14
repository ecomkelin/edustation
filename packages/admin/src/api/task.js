import http from './http'

/**
 * 任务模块 API (2026-07-08 立项, MM=36)
 *   - list/detail/create/update/remove: 任务主体 CRUD
 *   - submit/review/cancel: 状态机端点
 *   - addItem/toggleItem: checklist 条目操作
 *   - addComment: 评论
 *   - kanban/stats: 看板/统计
 *   - template*: 周期任务模板
 */
export const taskApi = {
  // ─── 任务主体 ─────────────────────────────
  list: (params) => http.get('/tasks', { params }),
  detail: (id, { includeArchived } = {}) => http.get(`/tasks/${id}`, { params: includeArchived ? { includeArchived: 'true' } : {} }),
  create: (data) => http.post('/tasks', data),
  update: (id, data) => http.patch(`/tasks/${id}`, data),
  remove: (id, { password } = {}) => http.delete(`/tasks/${id}`, { data: { password } }),
  removableCheck: (id) => http.get(`/tasks/${id}/removable-check`),

  // ─── 状态机 ─────────────────────────────
  submit: (id) => http.post(`/tasks/${id}/submit`),
  review: (id, data) => http.post(`/tasks/${id}/review`, data),
  cancel: (id, data) => http.post(`/tasks/${id}/cancel`, data || {}),

  // ─── 归档 (2026-07-08) ───────────────────
  archive: (id) => http.post(`/tasks/${id}/archive`),
  unarchive: (id) => http.post(`/tasks/${id}/unarchive`),

  // ─── 条目 ──────────────────────────────
  addItem: (id, data) => http.post(`/tasks/${id}/items`, data),
  toggleItem: (id, itemId, data) => http.patch(`/tasks/${id}/items/${itemId}`, data),
  // 2026-07-08: 配合物理删除挡板, 让用户清空 checklist 后能删任务
  removeItem: (id, itemId) => http.delete(`/tasks/${id}/items/${itemId}`),
  // 2026-07-09: 子任务备注 — 规则 3b 豁免, 不受执行中锁约束
  addItemRemark: (id, itemId, data) => http.post(`/tasks/${id}/items/${itemId}/remarks`, data),

  // ─── 评论 ──────────────────────────────
  addComment: (id, data) => http.post(`/tasks/${id}/comments`, data),

  // ─── 看板 / 统计 ────────────────────────
  kanban: (params) => http.get('/tasks/kanban', { params }),
  stats: () => http.get('/tasks/stats'),

  // ─── 模板 ──────────────────────────────
  templateList: (params) => http.get('/tasks/templates', { params }),
  templateCreate: (data) => http.post('/tasks/templates', data),
  templateUpdate: (id, data) => http.patch(`/tasks/templates/${id}`, data),
  templateRemove: (id) => http.delete(`/tasks/templates/${id}`),
  templateRunNow: (id) => http.post(`/tasks/templates/${id}/run-now`),
  templatePause: (id) => http.post(`/tasks/templates/${id}/pause`),
  templateResume: (id) => http.post(`/tasks/templates/${id}/resume`)
}