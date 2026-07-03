'use strict'

/**
 * 平台小游戏 (Game) 路由
 *
 * 路径: /api/v1/games
 *
 * 设计 (2026-07-03):
 *   - 平台超管统一发布, 跨机构对所有家长可见
 *   - C 端 /games /games/:id 公开; /games/:id/play 启动计数
 *   - admin 端 CRUD 走 requirePlatformAdmin (org=null 平台级)
 */
const router = require('express').Router()
const c = require('./game.controller')
const v = require('./game.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// R-3700 GET /games — C 端公开列表 (published + 分页)
router.get('/', v.list, mws.validateRequest, asyncHandler(c.list))

// R-3701 GET /games/:id — C 端公开详情
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))

// R-3702 POST /games/:id/play — C 端启动计数 (+1)
router.post(
  '/:id/play',
  mws.authenticate,
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.play)
)

// admin 端 CRUD (平台超管专属)

// R-3703 admin GET /games/admin/list — 后台列表
router.get(
  '/admin/list',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('game.read'),
  v.adminList,
  mws.validateRequest,
  asyncHandler(c.adminList)
)

// R-3704 admin POST /games/admin — 后台创建 (per-org, 2026-07-03 下放)
router.post(
  '/admin',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('game.write'),
  v.create,
  mws.validateRequest,
  asyncHandler(c.create)
)

// R-3705 admin PUT /games/admin/:id — 后台更新 (per-org, 2026-07-03 下放)
router.put(
  '/admin/:id',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('game.write'),
  v.idParam,
  v.update,
  mws.validateRequest,
  asyncHandler(c.update)
)

// R-3706 admin DELETE /games/admin/:id — 后台下架
router.delete(
  '/admin/:id',
  mws.authenticate,
  mws.requireOrg,
  mws.requirePermission('game.write'),
  v.idParam,
  mws.validateRequest,
  asyncHandler(c.remove)
)

module.exports = router
