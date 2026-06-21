'use strict'

const router = require('express').Router()
const c = require('./petAdmin.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 所有 admin 端 pet 路由需要登录 + 机构上下文
router.use(mws.authenticate, mws.requireOrg)

// 列表 / 详情 / 事件：pet.read
router.get('/accounts', mws.requirePermission('pet.read'), asyncHandler(c.list))
router.get('/accounts/:id', mws.requirePermission('pet.read'), asyncHandler(c.get))
router.get('/events', mws.requirePermission('pet.read'), asyncHandler(c.listEvents))

// 按 studentId 拿宠物（课堂展示页轮询前置查询）：pet.read
router.get('/accounts-by-student', mws.requirePermission('pet.read'), asyncHandler(c.getByStudent))

// 调整：pet.write
router.put('/accounts/:id', mws.requirePermission('pet.write'), asyncHandler(c.update))

// ─── 2026-06-21 pet-system-v2-ext：老师/admin 代操作 6 端点（全部 pet.write） ───
router.post('/accounts', mws.requirePermission('pet.write'), asyncHandler(c.adoptOnBehalf))
router.post('/accounts/:id/feed', mws.requirePermission('pet.write'), asyncHandler(c.feedOnBehalf))
router.post('/accounts/:id/hatch', mws.requirePermission('pet.write'), asyncHandler(c.hatchOnBehalf))
router.post('/accounts/:id/swap-egg', mws.requirePermission('pet.write'), asyncHandler(c.swapEggOnBehalf))
router.post('/accounts/:id/tier-down', mws.requirePermission('pet.write'), asyncHandler(c.tierDownOnBehalf))
router.post('/accounts/:id/equip', mws.requirePermission('pet.write'), asyncHandler(c.equipOnBehalf))

module.exports = router
