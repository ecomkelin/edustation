/**
 * Notification API (v0.9 立项)
 * 推送通知 / 偏好 / Inbox / 模板 / 流水
 *
 * C 端 /me/*:
 *   - R-4002 listMe            我的 inbox
 *   - R-4003 unreadCount       红点未读数
 *   - R-4004 markRead          单条已读
 *   - R-4005 markAllRead       一键已读
 *   - R-4006 archive           单条归档
 *   - R-4007 archiveAll        一键归档
 *   - R-4008 getPreferences    我的偏好
 *   - R-4009 updatePreferences 改我的偏好
 *
 * Admin /templates /admin/logs:
 *   - R-4010 listTemplates
 *   - R-4011 upsertTemplate
 *   - R-4012 listLogs
 *
 * Internal:
 *   - R-4001 publish           (服务端内部调用, 前端不暴露)
 */
import { http } from './request'

export const notificationApi = {
  // ─── C 端 inbox ───
  listMe(params = {}) {
    return http.get('/notifications/me', { data: params })
  },
  unreadCount(params = {}) {
    return http.get('/notifications/me/unread-count', { data: params })
  },
  markRead(id) {
    return http.post(`/notifications/${id}/read`)
  },
  markAllRead() {
    return http.post('/notifications/me/read-all')
  },
  archive(id) {
    return http.post(`/notifications/${id}/archive`)
  },
  archiveAll() {
    return http.post('/notifications/me/archive-all')
  },

  // ─── C 端 偏好 ───
  getPreferences() {
    return http.get('/notifications/me/preferences')
  },
  updatePreferences(payload = {}) {
    return http.put('/notifications/me/preferences', payload)
  },

  // ─── Admin 模板 ───
  listTemplates() {
    return http.get('/notifications/templates')
  },
  upsertTemplate(type, channel, payload = {}) {
    return http.put(`/notifications/templates/${type}/${channel}`, payload)
  },

  // ─── Admin 流水 ───
  listLogs(params = {}) {
    return http.get('/notifications/admin/logs', { data: params })
  }
}