'use strict'

/**
 * 平台科普视频 (Video) 路由
 *
 * 路径: /api/v1/videos
 *
 * 设计 (2026-07-03 立项):
 *   - 平台超管统一发布, 跨机构对所有 C 端家长可见 (org=null 平台级, 同 Article/Game 一致评级)
 *   - C 端 /videos /videos/featured /videos/:id 公开; /videos/:id/play 启动计数
 *   - admin 端 CRUD 走 requirePlatformAdmin (org=null 平台级内容)
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

// R-3803 POST /videos/:id/play — C 端播放/启动计数 (+1, 需鉴权)
// 视频下放到 per-org 后, 计数也要按 org 隔离, 强制 x-org-id
router.post(
  '/:id/play',
  mws.authenticate,
  mws.requireOrg,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.play)
)

// admin 端 CRUD (平台超管专属)

// R-3804 admin GET /videos/admin/list — 后台列表
router.get(
  '/admin/list',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('video.read'),
  v.adminList,
  mws.validateRequest,
  asyncHandler(c.adminList)
)

// R-3805 admin POST /videos/admin — 后台创建 (per-org, 2026-07-03 下放)
router.post(
  '/admin',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('video.write'),
  v.create,
  mws.validateRequest,
  asyncHandler(c.create)
)

// R-3806 admin PUT /videos/admin/:id — 后台更新 (per-org, 2026-07-03 下放)
router.put(
  '/admin/:id',
  mws.authenticate,
  mws.requireOrg,
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
  mws.requireOrg,
  mws.requirePermission('video.write'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.remove)
)

module.exports = router
