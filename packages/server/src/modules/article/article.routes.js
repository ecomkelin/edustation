'use strict'

/**
 * 平台科普文章 (Article) 路由 — 2026-07-22 改造: platform-level catalog,
 * 但「写」权限可委托给平台内容运营 (普通机构管理员不能自助 grant pet.write/article.write/video.write, 见 position.service)
 *
 * 路径: /api/v1/articles
 *
 * 设计:
 *   - 平台级 (org=null): 跨机构对所有家长可见
 *   - 公开端点无需任何中间件 (C 端首页直接调)
 *   - admin 端点改 requirePermission('article.write' | 'article.read')
 *     —— 拥有这些 perm 的账号 (平台超管 / 平台 · 内容主编) 才能进
 *   - 物理删除 (R-3608) 仍走 requirePlatformAdmin + requirePlatformPassword 双重硬门 (CLAUDE.md §8.1)
 *
 * 路由顺序:
 *   /                 -> C 端公开
 *   /admin/*          -> 后台管理 (article.read / article.write)
 *   /admin/:id/purge  -> 平台超管专属 + 密码 (物理删除)
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

// ─────── admin CRUD (2026-07-22: requirePermission 取代硬门 requirePlatformAdmin) ───────
// 拥有 article.write 权限码即可 —— 来源可以是平台超管, 也可以是平台 · 内容主编

// R-3602 admin GET /articles/admin/list — 后台列表 (含草稿)
router.get(
  '/admin/list',
  mws.authenticate,
  mws.requirePermission('article.read'),
  v.adminList,
  mws.validateRequest,
  asyncHandler(c.adminList)
)

// R-3603 admin POST /articles/admin — 后台创建
router.post(
  '/admin',
  mws.authenticate,
  mws.requirePermission('article.write'),
  v.create,
  mws.validateRequest,
  asyncHandler(c.create)
)

// R-3604 admin PUT /articles/admin/:id — 后台更新
router.put(
  '/admin/:id',
  mws.authenticate,
  mws.requirePermission('article.write'),
  v.idParam,
  v.update,
  mws.validateRequest,
  asyncHandler(c.update)
)

// R-3605 admin DELETE /articles/admin/:id — 后台下架 (软删 isPublished=false)
router.delete(
  '/admin/:id',
  mws.authenticate,
  mws.requirePermission('article.write'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.remove)
)

// ─────── 运营分析 (2026-07-04) ───────
// R-3606 GET /articles/admin/stats — 顶部 KPI 4 张卡
router.get(
  '/admin/stats',
  mws.authenticate,
  mws.requirePermission('article.read'),
  mws.validateRequest,
  asyncHandler(c.adminStats)
)

// R-3607 GET /articles/admin/row-stats — 每行 _stats 注入 (Map<contentId, stats>)
router.get(
  '/admin/row-stats',
  mws.authenticate,
  mws.requirePermission('article.read'),
  mws.validateRequest,
  asyncHandler(c.adminRowStats)
)

// ─────── 物理删除 (2026-07-04 立项, CLAUDE.md §8.1 三重防护) ───────
// R-3608 POST /articles/admin/:id/purge — 平台超管物理删除 (requirePlatformPassword 中间件)
//   互锁: ContentEngagement.contentId 引用存在则挡 (assertUnused 422)
//   业务: 不 cascade 删 ContentEngagement, 挡板提示先评估影响
//   (2026-07-22) 即便 article.write 可委托, 物理删除仍只走超管 —
//   因为这是 §8.1 框架的 D 级操作 (高风险, 不可逆)
router.post(
  '/admin/:id/purge',
  mws.authenticate,
  mws.requirePlatformAdmin,
  mws.requirePlatformPassword,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.purge)
)

// R-3609 GET /articles/admin/:id/removable-check — 预检
router.get(
  '/admin/:id/removable-check',
  mws.authenticate,
  mws.requirePermission('article.read'),
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
  mws.requirePermission('article.read'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.adminDetail)
)

module.exports = router
