import http from '@/api/http'

/**
 * 操作留痕 API 封装 (2026-06-27)
 *
 * 后端 5 端点 (R-MMPP MM=35, 仅平台超管可见):
 *   list(params)       GET    /audit-logs
 *   stats(params)      GET    /audit-logs/stats
 *   options()          GET    /audit-logs/options      (method/path/users 筛选下拉)
 *   exportCsv(params)  GET    /audit-logs/export.csv  (后端写 BOM + ; 分隔)
 *   detail(id)         GET    /audit-logs/:id
 *
 * 注意: 后端 controller 走 `{ success, data }` 包装, 拦截器已解包
 *       (api/http.js response interceptor return body), 所以直接拿 res 就是 data.
 */

function list(params = {}) {
  return http.get('/audit-logs', { params })
}

function stats(params = {}) {
  return http.get('/audit-logs/stats', { params })
}

function options() {
  return http.get('/audit-logs/options')
}

function detail(id) {
  return http.get(`/audit-logs/${id}`)
}

function exportCsv(params = {}) {
  return http.get('/audit-logs/export.csv', {
    params,
    responseType: 'blob'
  })
}

export default { list, stats, options, detail, exportCsv }
