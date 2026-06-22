'use strict'

/**
 * Pet Routes（2026-06-21 pet-system-v2 完整版）
 *
 * C 端（家长）：
 *   - 中间件链：authenticate → requireOrg → activeStudent → requireEnrolledStudent
 *   - 不需要业务权限码（C 端走 guardian 校验）
 *
 * 端点清单见 pet.controller.js 与 plan §7.1
 */

const router = require('express').Router()
const c = require('./pet.controller')
const shopRoutes = require('./petShop.routes')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// C 端：先拉一次 PetAccount（懒创建兜底），不强制 requireEnrolledStudent
// （家长首次进来没有 active student 时也能调用 GET /pet/me?student=xxx 自己创建）
router.use(mws.authenticate, mws.requireOrg, mws.activeStudent)

// GET 端点：不要求 enrolled（懒创建即可）
// R-2272 GET /pet/me
router.get('/me', asyncHandler(c.me))
// R-2206 GET /pet/species
router.get('/species', asyncHandler(c.species))
// R-2207 GET /pet/items
router.get('/items', asyncHandler(c.items))
// R-2200 GET /pet/events
router.get('/events', asyncHandler(c.events))

// 写端点：必须 enrolled（按 D8 决策，未报班不能领养/喂养/换装）
router.use(mws.requireEnrolledStudent)
// R-2263 POST /pet/adopt
router.post('/adopt', asyncHandler(c.adopt))
// R-2264 POST /pet/hatch
router.post('/hatch', asyncHandler(c.hatch))
// R-2265 POST /pet/feed
router.post('/feed', asyncHandler(c.feed))
// R-2267 POST /pet/swap-egg
router.post('/swap-egg', asyncHandler(c.swapEgg))
// R-2268 POST /pet/tier-down
router.post('/tier-down', asyncHandler(c.tierDown))
// R-2266 POST /pet/equip
router.post('/equip', asyncHandler(c.equip))

// ─── 2026-06-22 pet-shop：商城子路由（R-2370/2371/2372） ───
// shopRoutes 内部会再分 enrolled 校验：GET /shop 不要求，写操作要求
router.use(shopRoutes)

module.exports = router
