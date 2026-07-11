/**
 * Notification API (admin 端) - v0.9 立项
 * R-4010 GET /notifications/templates
 * R-4011 PUT /notifications/templates/:type/:channel
 * R-4012 GET /notifications/admin/logs
 * R-4001 POST /notifications/publish (内部发布)
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
  // R-4012 发送流水
  listLogs(params = {}) {
    return http.get('/notifications/admin/logs', { params })
  },
  // R-4001 内部发布 (代发补送场景)
  publish(payload = {}) {
    return http.post('/notifications/publish', payload)
  }
}