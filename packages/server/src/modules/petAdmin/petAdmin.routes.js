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

// ─── 老师/admin 代操作（去 swap/tier/equip；2026-07-15 重构） ───
// R-2363 POST /admin/pet/accounts（代领养，可多只）
router.post('/accounts', mws.requirePermission('pet.write'), asyncHandler(c.adoptOnBehalf))
// R-2365 POST /admin/pet/accounts/:id/feed
router.post('/accounts/:id/feed', mws.requirePermission('pet.write'), asyncHandler(c.feedOnBehalf))
// R-2364 POST /admin/pet/accounts/:id/hatch
router.post('/accounts/:id/hatch', mws.requirePermission('pet.write'), asyncHandler(c.hatchOnBehalf))
// R-2369 POST /admin/pet/accounts/:id/set-default
router.post('/accounts/:id/set-default', mws.requirePermission('pet.write'), asyncHandler(c.setDefaultOnBehalf))
// 2026-07-16 R-2377 DELETE /admin/pet/accounts/:id — 弃养 (§8.1 三重防护: 平台超管 + pet.write + 密码)
// 2026-07-16 R-2378 GET /admin/pet/accounts/:id/removable-check — 预检 (pet.read, 不需超管+密码)
router.delete('/accounts/:id',
  mws.requirePlatformAdmin,
  mws.requirePermission('pet.write'),
  mws.requirePlatformPassword,
  asyncHandler(c.removePetAccount))
router.get('/accounts/:id/removable-check',
  mws.requirePermission('pet.read'),
  asyncHandler(c.removableCheckPetAccount))
// 2026-07-15 DEPRECATED（装饰/等阶删除）：R-2366 equip / R-2367 swap-egg / R-2368 tier-down / R-2376 tier-up 已移除

// ─── pet-shop：老师/admin 代买消耗品（扣学员积分） ───
// 2026-07-15 DEPRECATED: R-2373 grant-item 已随装饰系统删除
// R-2374 POST /admin/pet/grant-consumable
router.post('/grant-consumable', mws.requirePermission('pet.write'), asyncHandler(shopC.grantConsumable))
// R-2375 GET /admin/pet/shop — admin 端商城列表（不走 active student 中间件）
router.get('/shop', mws.requirePermission('pet.read'), asyncHandler(shopC.adminListShop))

module.exports = router
