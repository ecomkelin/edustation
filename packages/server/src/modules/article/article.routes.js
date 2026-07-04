'use strict'

/**
 * 平台科普文章 (Article) 路由
 *
 * 路径: /api/v1/articles
 *
 * 设计 (2026-07-03 立项):
 *   - 平台超管统一发布 (org=null), 所有 C 端家长都能看
 *   - 公开端点无需权限码; admin 端 CRUD 走 article.read/write/delete 权限
 *   - /me 最近阅读/收藏 走鉴权 (1 期先不上)
 *
 * 路由顺序:
 *   /admin -> C 端先注册 (无权限码)
 *   /admin/* -> admin 端 CRUD (权限码)
 */
const router = require('express').Router()
const c = require('./article.controller')
const v = require('./article.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 公开端点 (C 端) - 无需鉴权 (可选 mws.authenticate 仍生效以拿 userId, 用于后续个性化)
// 这里保持完全公开, 简单可控

// R-3600 GET /articles — C 端公开列表 (published + 分页)
router.get('/', v.list, mws.validateRequest, asyncHandler(c.list))

// R-3601 GET /articles/:id — C 端公开详情 (+1 viewCount)
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))

// admin 端 CRUD (权限码: article.read / article.write / article.delete)
// 因为 /admin 路径开头, 顺序不重要

// R-3602 admin GET /articles/admin/list — 后台列表 (含草稿)
router.get(
  '/admin/list',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('article.read'),
  v.adminList,
  mws.validateRequest,
  asyncHandler(c.adminList)
)

// R-3603 admin POST /articles/admin — 后台创建 (per-org, 2026-07-03 下放)
router.post(
  '/admin',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('article.write'),
  v.create,
  mws.validateRequest,
  asyncHandler(c.create)
)

// R-3604 admin PUT /articles/admin/:id — 后台更新 (per-org, 2026-07-03 下放)
router.put(
  '/admin/:id',
  mws.authenticate,
  mws.requireOrg,
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
  mws.requireOrg,
  mws.requirePermission('article.write'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.remove)
)

// ────── 运营分析 (2026-07-04) ──────
// R-3606 GET /articles/admin/stats — 顶部 KPI 4 张卡
router.get(
  '/admin/stats',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('article.read'),
  mws.validateRequest,
  asyncHandler(c.adminStats)
)

// R-3607 GET /articles/admin/row-stats — 每行 _stats 注入 (Map<contentId, stats>)
router.get(
  '/admin/row-stats',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('article.read'),
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
  mws.requireOrg,
  mws.requirePlatformPassword,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.purge)
)

// R-3609 GET /articles/admin/:id/removable-check — 预检 (普通业务岗 article.read 即可调)
router.get(
  '/admin/:id/removable-check',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('article.read'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.removableCheck)
)

// R-3612 GET /articles/admin/:id — admin 单条详情
//   含 contentMarkdown + contentHtml (adminList 为省带宽显式剔除;)
//   不过滤 isPublished (草稿也能编辑)
//   普通业务岗 article.read 即可调
router.get(
  '/admin/:id',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('article.read'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.adminDetail)
)

module.exports = router
