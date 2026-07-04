/**
 * Video API - 平台科普视频 (admin 端 CRUD)
 * R-3804/3805/3806/3807 (CRUD) + R-3808/3809 (运营分析 2026-07-04)
 */
import http from './http'

export const videoApi = {
  // R-3804 GET /videos/admin/list
  adminList(params = {}) {
    return http.get('/videos/admin/list', { params })
  },
  // R-3805 POST /videos/admin
  create(data) {
    return http.post('/videos/admin', data)
  },
  // R-3806 PUT /videos/admin/:id
  update(id, data) {
    return http.put(`/videos/admin/${id}`, data)
  },
  // R-3807 DELETE /videos/admin/:id (软下架, 2026-07-04 起 admin UI 不再调, 后端保留)
  remove(id) {
    return http.delete(`/videos/admin/${id}`)
  },
  // R-3802 GET /videos/:id (admin 端借用详情接口)
  detail(id) {
    return http.get(`/videos/${id}`)
  },
  // R-3808 顶部 KPI 卡 (累计播放 / 独立观众 / 累计观看时长)
  adminStats(params = {}) {
    return http.get('/videos/admin/stats', { params })
  },
  // R-3809 per-row Map<contentId, {totalEvents, uniqueStudents, totalMs}>
  adminRowStats(params = {}) {
    return http.get('/videos/admin/row-stats', { params })
  }
}
