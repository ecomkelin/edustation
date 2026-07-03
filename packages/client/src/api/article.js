/**
 * Article API - 平台科普文章 (R-3600/3601)
 * 公开端点无需权限码
 */
import { http } from './request'

export const articleApi = {
  // R-3600 GET /articles
  list(params = {}) {
    return http.get('/articles', { data: params })
  },
  // R-3601 GET /articles/:id
  detail(id) {
    return http.get(`/articles/${id}`)
  }
}
