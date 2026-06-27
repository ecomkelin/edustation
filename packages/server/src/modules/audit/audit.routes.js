'use strict'

/**
 * 审计日志路由 (2026-06-27 立项)
 *
 * 基础路径: /api/v1/audit-logs
 * 中间件链: routers/index.js 顶部全局 mws.authenticate → mws.auditTrail → 本路由 mws.requirePlatformAdmin
 * 权限: 不引入 audit.read 权限码, 硬卡 requirePlatformAdmin (用户决策 2026-06-27)
 *
 * 路由编号 (R-MMPP, MM=35):
 *   R-3500 GET    /audit-logs                  列表 (分页 + 筛选)
 *   R-3501 GET    /audit-logs/stats            统计 (method × statusCode 桶)
 *   R-3502 GET    /audit-logs/options          筛选下拉 (去重 method/path/users)
 *   R-3503 GET    /audit-logs/export.csv       导出 CSV (BOM, Excel 友好)
 *   R-3504 GET    /audit-logs/:id              详情
 *
 * 审计自身不审计: auditTrail SKIP_PATH_PREFIXES 含 /audit-logs, 防止查审计时刷出一堆自指日志.
 */
const router = require('express').Router()
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')
const ctl = require('./audit.controller')

// 硬卡: 仅平台超管可见 (用户决策 2026-06-27)
// 顶层 routers/index.js 只挂了 auditTrail (无 user 兜底), 这里的 authenticate 必须
// 显式 use, 否则 /audit-logs 会撞 requirePlatformAdmin 的 401.
router.use(mws.authenticate, mws.requirePlatformAdmin)

router.get('/', asyncHandler(ctl.list))                            // R-3500
router.get('/stats', asyncHandler(ctl.stats))                      // R-3501
router.get('/options', asyncHandler(ctl.options))                  // R-3502
router.get('/export.csv', asyncHandler(ctl.exportCsv))             // R-3503
router.get('/:id', asyncHandler(ctl.detail))                       // R-3504

module.exports = router
