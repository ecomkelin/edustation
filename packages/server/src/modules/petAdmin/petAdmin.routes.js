'use strict'

const router = require('express').Router()
const c = require('./petAdmin.controller')
const shopC = require('@modules/pet/petShop.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 所有 admin 端 pet 路由需要登录 + 机构上下文
router.use(mws.authenticate, mws.requireOrg)

// 列表 / 详情 / 事件：pet.read
// R-2300 GET /admin/pet/accounts
router.get('/accounts', mws.requirePermission('pet.read'), asyncHandler(c.list))
// R-2301 GET /admin/pet/accounts/:id
router.get('/accounts/:id', mws.requirePermission('pet.read'), asyncHandler(c.get))
// R-2307 GET /admin/pet/events
router.get('/events', mws.requirePermission('pet.read'), asyncHandler(c.listEvents))

// 按 studentId 拿宠物（课堂展示页轮询前置查询）：pet.read
// R-2306 GET /admin/pet/accounts-by-student
router.get('/accounts-by-student', mws.requirePermission('pet.read'), asyncHandler(c.getByStudent))

// 调整：pet.write
// R-2303 PUT /admin/pet/accounts/:id
router.put('/accounts/:id', mws.requirePermission('pet.write'), asyncHandler(c.update))

// ─── 2026-06-21 pet-system-v2-ext：老师/admin 代操作 6 端点（全部 pet.write） ───
// R-2363 POST /admin/pet/accounts
router.post('/accounts', mws.requirePermission('pet.write'), asyncHandler(c.adoptOnBehalf))
// R-2365 POST /admin/pet/accounts/:id/feed
router.post('/accounts/:id/feed', mws.requirePermission('pet.write'), asyncHandler(c.feedOnBehalf))
// R-2364 POST /admin/pet/accounts/:id/hatch
router.post('/accounts/:id/hatch', mws.requirePermission('pet.write'), asyncHandler(c.hatchOnBehalf))
// R-2367 POST /admin/pet/accounts/:id/swap-egg
router.post('/accounts/:id/swap-egg', mws.requirePermission('pet.write'), asyncHandler(c.swapEggOnBehalf))
// R-2368 POST /admin/pet/accounts/:id/tier-down
router.post('/accounts/:id/tier-down', mws.requirePermission('pet.write'), asyncHandler(c.tierDownOnBehalf))
// 2026-06-22: 手动升阶（满级后主动点击，绕开 feed 触发）
router.post('/accounts/:id/tier-up', mws.requirePermission('pet.write'), asyncHandler(c.tierUpOnBehalf))
// R-2366 POST /admin/pet/accounts/:id/equip
router.post('/accounts/:id/equip', mws.requirePermission('pet.write'), asyncHandler(c.equipOnBehalf))

// ─── 2026-06-22 pet-shop：老师/admin 代买（扣学员积分） ───
// R-2373 POST /admin/pet/grant-item
router.post('/grant-item', mws.requirePermission('pet.write'), asyncHandler(shopC.grantItem))
// R-2374 POST /admin/pet/grant-consumable
router.post('/grant-consumable', mws.requirePermission('pet.write'), asyncHandler(shopC.grantConsumable))
// R-2375 GET /admin/pet/shop — admin 端商城列表（不走 active student 中间件）
router.get('/shop', mws.requirePermission('pet.read'), asyncHandler(shopC.adminListShop))

module.exports = router
