/**
 * Notification API (admin 端) - v0.9 立项
 * R-4010 GET   /notifications/templates
 * R-4011 PUT   /notifications/templates/:type/:channel
 * R-4017 DELETE /notifications/templates/:type/:channel  (2026-07-14 新增, 重置)
 * R-4012 GET   /notifications/admin/logs
 * R-4001 POST  /notifications/publish (内部发布)
 *
 * 员工 inbox (2026-07-13 新增, MM=40 续):
 *   R-4013 GET    /notifications/me/staff
 *   R-4014 GET    /notifications/me/staff/unread-count
 *   R-4015 POST   /notifications/me/staff/read-all
 *   R-4016 POST   /notifications/me/staff/archive-all
 *   R-3604 POST   /notifications/:id/read      (员工/家长共用, 走 :id 校验属主)
 *   R-3606 POST   /notifications/:id/archive  (同上)
 */
import http from './http'

export const notificationApi = {
  // R-4010 模板列表 (机构 + 平台默认合并)
  listTemplates() {
    return http.get('/notifications/templates')
  },
  // R-4011 新增/编辑模板 (按 type+channel upsert)
  upsertTemplate(type, channel, payload = {}) {
    return http.put(`/notifications/templates/${type}/${channel}`, payload)
  },
  // R-4017 重置: 机构自定义 → 回退平台默认 (2026-07-14 新增, 幂等)
  removeTemplate(type, channel) {
    return http.delete(`/notifications/templates/${type}/${channel}`)
  },
  // R-4018 批量重置: 一次性清空本机构所有 org 自定义模板 (2026-07-14 新增, 幂等)
  resetAllTemplates() {
    return http.post('/notifications/templates/reset-all')
  },
  // R-4012 发送流水
  listLogs(params = {}) {
    return http.get('/notifications/admin/logs', { params })
  },
  // R-4001 内部发布 (代发补送场景)
  publish(payload = {}) {
    return http.post('/notifications/publish', payload)
  },

  // ─── 员工 inbox (2026-07-13 新增) ───
  // R-4013 员工 inbox 列表
  staffList(params = {}) {
    return http.get('/notifications/me/staff', { params })
  },
  // R-4014 员工红点未读数
  staffUnreadCount() {
    return http.get('/notifications/me/staff/unread-count')
  },
  // R-4015 员工一键已读
  staffMarkAllRead() {
    return http.post('/notifications/me/staff/read-all')
  },
  // R-4016 员工一键归档
  staffArchiveAll() {
    return http.post('/notifications/me/staff/archive-all')
  },
  // R-3604 单条已读 (员工/家长共用)
  markRead(id) {
    return http.post(`/notifications/${id}/read`)
  },
  // R-3606 单条归档
  archive(id) {
    return http.post(`/notifications/${id}/archive`)
  },
  // R-4019 单条详情 (2026-07-18 新增, 详情页用)
  detail(id) {
    return http.get(`/notifications/${id}`)
  }
}