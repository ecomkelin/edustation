/**
 * Article API - 平台科普文章 (admin 端 CRUD)
 * R-3602/3603/3604/3605
 */
import http from './http'

export const articleApi = {
  // R-3602 GET /articles/admin/list
  adminList(params = {}) {
    return http.get('/articles/admin/list', { params })
  },
  // R-3603 POST /articles/admin
  create(data) {
    return http.post('/articles/admin', data)
  },
  // R-3604 PUT /articles/admin/:id
  update(id, data) {
    return http.put(`/articles/admin/${id}`, data)
  },
  // R-3605 DELETE /articles/admin/:id (软下架)
  remove(id) {
    return http.delete(`/articles/admin/${id}`)
  },
  // R-3601 GET /articles/:id (admin 端可借用详情接口读取草稿)
  detail(id) {
    return http.get(`/articles/${id}`)
  }
}
