/**
 * Article API - 平台科普文章 (admin 端 CRUD)
 * R-3602/3603/3604/3605 (CRUD) + R-3606/3607 (运营分析 2026-07-04)
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
  // R-3605 DELETE /articles/admin/:id (软下架, 2026-07-04 起 admin UI 不再调, 后端保留)
  remove(id) {
    return http.delete(`/articles/admin/${id}`)
  },
  // R-3601 GET /articles/:id (admin 端可借用详情接口读取草稿)
  detail(id) {
    return http.get(`/articles/${id}`)
  },
  // R-3612 GET /articles/admin/:id — admin 单条详情 (含 contentMarkdown, 草稿也能看)
  //   dialog edit 时调 — adminList 投影剔除了大字段
  adminDetail(id) {
    return http.get(`/articles/admin/${id}`)
  },
  // R-3606 顶部 KPI 卡 (累计浏览 / 独立孩子观众 / 总时长)
  adminStats(params = {}) {
    return http.get('/articles/admin/stats', { params })
  },
  // R-3607 per-row Map<contentId, {totalEvents, uniqueStudents, totalMs}>
  adminRowStats(params = {}) {
    return http.get('/articles/admin/row-stats', { params })
  },
  // R-3608 平台超管物理删除 (requirePlatformPassword 中间件, body 必带 password)
  purge(id, { password } = {}) {
    return http.post(`/articles/admin/${id}/purge`, { password })
  },
  // R-3609 删除预检 (普通业务岗 article.read 即可调, 返 {canRemove, blockers})
  removableCheck(id) {
    return http.get(`/articles/admin/${id}/removable-check`)
  }
}
