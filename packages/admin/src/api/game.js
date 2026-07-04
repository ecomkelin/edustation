/**
 * Game API - 平台小游戏 (admin 端 CRUD)
 * R-3703/3704/3705/3706 (CRUD) + R-3707/3708 (运营分析 2026-07-04)
 */
import http from './http'

export const gameApi = {
  // R-3703 GET /games/admin/list
  adminList(params = {}) {
    return http.get('/games/admin/list', { params })
  },
  // R-3704 POST /games/admin
  create(data) {
    return http.post('/games/admin', data)
  },
  // R-3705 PUT /games/admin/:id
  update(id, data) {
    return http.put(`/games/admin/${id}`, data)
  },
  // R-3706 DELETE /games/admin/:id (软下架, 2026-07-04 起 admin UI 不再调, 后端保留)
  remove(id) {
    return http.delete(`/games/admin/${id}`)
  },
  // R-3701 GET /games/:id
  detail(id) {
    return http.get(`/games/${id}`)
  },
  // R-3707 顶部 KPI 卡 (累计启动 / 独立玩家 / 累计游玩时长)
  adminStats(params = {}) {
    return http.get('/games/admin/stats', { params })
  },
  // R-3708 per-row Map<contentId, {totalEvents, uniqueStudents, totalMs}>
  adminRowStats(params = {}) {
    return http.get('/games/admin/row-stats', { params })
  }
}
