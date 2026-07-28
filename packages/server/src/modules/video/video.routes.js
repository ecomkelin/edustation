'use strict'

/**
 * 平台科普视频 (Video) 路由 — 2026-07-22 改造: 与 article 平级,
 * platform-level catalog 「写」权限可委托给平台内容运营 (普通机构管理员不能自助 grant video.write, 见 position.service)
 *
 * 路径: /api/v1/videos
 *
 * 设计:
 *   - 平台级 (org=null): 跨机构对所有家长可见
 *   - 公开端点无需任何中间件 (C 端探索 tab 直接调)
 *   - admin 端点改 requirePermission('video.write' | 'video.read')
 *   - 物理删除 (R-3810) 走 requirePlatformAdmin + requirePlatformPassword (CLAUDE.md §8.1 高风险硬门)
 *   - /videos/:id/play 仍走 mws.authenticate (要拿 activeStudentId 记 engagement)
 */
const router = require('express').Router()
const c = require('./video.controller')
const v = require('./video.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// R-3800 GET /videos/featured — C 端默认展示: 返回最新 1 个 (英雄位)
router.get('/featured', asyncHandler(c.featured))

// R-3801 GET /videos — C 端公开全量列表 (分页)
router.get('/', v.list, mws.validateRequest, asyncHandler(c.list))

// R-3802 GET /videos/:id — C 端公开详情 (+1 viewCount)
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))

// R-3803 POST /videos/:id/play — C 端播放/启动计数 (+1, 需鉴权拿 activeStudentId)
// 2026-07-14 改造: 内容 platform-only, 不再 requireOrg (service 不校验 orgId)
router.post(
  '/:id/play',
  mws.authenticate,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.play)
)

// ─────── admin CRUD (2026-07-22: requirePermission 取代硬门 requirePlatformAdmin) ───────

// R-3804 admin GET /videos/admin/list — 后台列表
router.get(
  '/admin/list',
  mws.authenticate,
  mws.requirePermission('video.read'),
  v.adminList,
  mws.validateRequest,
  asyncHandler(c.adminList)
)

// R-3805 admin POST /videos/admin — 后台创建
router.post(
  '/admin',
  mws.authenticate,
  mws.requirePermission('video.write'),
  v.create,
  mws.validateRequest,
  asyncHandler(c.create)
)

// R-3806 admin PUT /videos/admin/:id — 后台更新
router.put(
  '/admin/:id',
  mws.authenticate,
  mws.requirePermission('video.write'),
  v.idParam,
  v.update,
  mws.validateRequest,
  asyncHandler(c.update)
)

// R-3807 admin DELETE /videos/admin/:id — 后台下架 (软删 isPublished=false)
router.delete(
  '/admin/:id',
  mws.authenticate,
  mws.requirePermission('video.write'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.remove)
)

// ─────── 运营分析 (2026-07-04) ───────
// R-3808 GET /videos/admin/stats — 顶部 KPI 4 张卡
router.get(
  '/admin/stats',
  mws.authenticate,
  mws.requirePermission('video.read'),
  mws.validateRequest,
  asyncHandler(c.adminStats)
)

// R-3809 GET /videos/admin/row-stats — 每行 _stats 注入 (Map<contentId, stats>)
router.get(
  '/admin/row-stats',
  mws.authenticate,
  mws.requirePermission('video.read'),
  mws.validateRequest,
  asyncHandler(c.adminRowStats)
)

// ─────── 物理删除 (2026-07-04 立项, CLAUDE.md §8.1 三重防护) ───────
// R-3810 POST /videos/admin/:id/purge — 平台超管物理删除
//   互锁: ContentEngagement.contentId 引用存在则挡 (assertUnused 422)
//   (2026-07-22) 即便 video.write 可委托, 物理删除仍只走超管 — §8.1 框架的 D 级操作
router.post(
  '/admin/:id/purge',
  mws.authenticate,
  mws.requirePlatformAdmin,
  mws.requirePlatformPassword,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.purge)
)

// R-3811 GET /videos/admin/:id/removable-check — 预检
router.get(
  '/admin/:id/removable-check',
  mws.authenticate,
  mws.requirePermission('video.read'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.removableCheck)
)

module.exports = router
