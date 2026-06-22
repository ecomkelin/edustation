'use strict'

const router = require('express').Router()
const c = require('./petAdmin.controller')
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
// R-2366 POST /admin/pet/accounts/:id/equip
router.post('/accounts/:id/equip', mws.requirePermission('pet.write'), asyncHandler(c.equipOnBehalf))

module.exports = router
