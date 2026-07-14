'use strict'

/**
 * 平台科普文章 (Article) 路由 — 2026-07-14 内容回退 platform-only
 *
 * 路径: /api/v1/articles
 *
 * 设计:
 *   - 平台级 (org=null): 跨机构对所有家长可见
 *   - 公开端点无需任何中间件 (C 端首页直接调)
 *   - admin CRUD 端点要求 isPlatformAdmin (requirePlatformAdmin)
 *   - 物理删除 (R-3608) 走 requirePlatformPassword 中间件 + assertUnused 互锁
 *   - 物理删除预检 (R-3609) 保留 article.read 权限码 (普通机构员工可见; 但实际上权限码已从 DEFAULT_POSITIONS 撤销, 当前仅平台超管触发, DestructiveConfirm precheck 仍按 requirePermission 模式保留)
 *
 * 路由顺序:
 *   /admin -> C 端先注册 (无权限码)
 *   /admin/* -> admin 端 CRUD (requirePlatformAdmin)
 */
const router = require('express').Router()
const c = require('./article.controller')
const v = require('./article.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// R-3600 GET /articles — C 端公开列表 (published + 分页)
router.get('/', v.list, mws.validateRequest, asyncHandler(c.list))

// R-3601 GET /articles/:id — C 端公开详情 (+1 viewCount)
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))

// admin 端 CRUD (requirePlatformAdmin 中间件 — 仅平台超管可管科普内容)

// R-3602 admin GET /articles/admin/list — 后台列表 (含草稿)
router.get(
  '/admin/list',
  mws.authenticate,
  mws.requirePlatformAdmin,
  v.adminList,
  mws.validateRequest,
  asyncHandler(c.adminList)
)

// R-3603 admin POST /articles/admin — 后台创建
router.post(
  '/admin',
  mws.authenticate,
  mws.requirePlatformAdmin,
  v.create,
  mws.validateRequest,
  asyncHandler(c.create)
)

// R-3604 admin PUT /articles/admin/:id — 后台更新
router.put(
  '/admin/:id',
  mws.authenticate,
  mws.requirePlatformAdmin,
  v.idParam,
  v.update,
  mws.validateRequest,
  asyncHandler(c.update)
)

// R-3605 admin DELETE /articles/admin/:id — 后台下架 (软删 isPublished=false)
router.delete(
  '/admin/:id',
  mws.authenticate,
  mws.requirePlatformAdmin,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.remove)
)

// ────── 运营分析 (2026-07-04) ──────
// R-3606 GET /articles/admin/stats — 顶部 KPI 4 张卡
// 2026-07-14 改造: requirePlatformAdmin (内容 platform-only, 不再 per-org 校验)
router.get(
  '/admin/stats',
  mws.authenticate,
  mws.requirePlatformAdmin,
  mws.validateRequest,
  asyncHandler(c.adminStats)
)

// R-3607 GET /articles/admin/row-stats — 每行 _stats 注入 (Map<contentId, stats>)
router.get(
  '/admin/row-stats',
  mws.authenticate,
  mws.requirePlatformAdmin,
  mws.validateRequest,
  asyncHandler(c.adminRowStats)
)

// ────── 物理删除 (2026-07-04 立项, CLAUDE.md §8.1 三重防护) ──────
// R-3608 POST /articles/admin/:id/purge — 平台超管物理删除 (requirePlatformPassword 中间件)
//   互锁: ContentEngagement.contentId 引用存在则挡 (assertUnused 422)
//   业务: 不 cascade 删 ContentEngagement, 挡板提示先评估影响
router.post(
  '/admin/:id/purge',
  mws.authenticate,
  mws.requirePlatformPassword,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.purge)
)

// R-3609 GET /articles/admin/:id/removable-check — 预检
//   2026-07-14 改造: requirePlatformAdmin (article.read 权限码已从普通 Position 撤销持有, 留作 catalog 占位)
router.get(
  '/admin/:id/removable-check',
  mws.authenticate,
  mws.requirePlatformAdmin,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.removableCheck)
)

// R-3612 GET /articles/admin/:id — admin 单条详情
//   含 contentMarkdown + contentHtml (adminList 为省带宽显式剔除;)
//   不过滤 isPublished (草稿也能编辑)
router.get(
  '/admin/:id',
  mws.authenticate,
  mws.requirePlatformAdmin,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.adminDetail)
)

module.exports = router
