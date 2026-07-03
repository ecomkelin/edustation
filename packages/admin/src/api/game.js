/**
 * Game API - 平台小游戏 (admin 端 CRUD)
 * R-3703/3704/3705/3706
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
  // R-3706 DELETE /games/admin/:id (软下架)
  remove(id) {
    return http.delete(`/games/admin/${id}`)
  },
  // R-3701 GET /games/:id
  detail(id) {
    return http.get(`/games/${id}`)
  }
}
