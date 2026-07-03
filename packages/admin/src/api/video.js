/**
 * Video API - 平台科普视频 (admin 端 CRUD)
 * R-3804/3805/3806/3807
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
  // R-3807 DELETE /videos/admin/:id (软下架)
  remove(id) {
    return http.delete(`/videos/admin/${id}`)
  },
  // R-3802 GET /videos/:id (admin 端借用详情接口)
  detail(id) {
    return http.get(`/videos/${id}`)
  }
}
