'use strict'

/**
 * 宠物商城 Routes（C 端 — 2026-06-22 pet-shop）
 *
 * 中间件链：authenticate → requireOrg → activeStudent → requireEnrolledStudent
 *   - 列表 R-2370：GET /pet/shop（不要求 enrolled，只读）
 *   - 写操作：requireEnrolledStudent 兜底（未报班不能买）
 *
 * 注意：本文件挂到 pet 主路由 `/pet` 之下（与现有 pet.routes.js 同前缀）
 */

const router = require('express').Router()
const c = require('./petShop.controller')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

// 不要求 enrolled（只读）
// R-2370 GET /pet/shop
router.get('/shop', asyncHandler(c.listShop))

// 写操作：必须 enrolled（学员至少报 1 个班才能消费）
router.use(mws.requireEnrolledStudent)
// R-2371 POST /pet/shop/buy-item
router.post('/shop/buy-item', asyncHandler(c.buyItem))
// R-2372 POST /pet/shop/buy-consumable
router.post('/shop/buy-consumable', asyncHandler(c.buyConsumable))

module.exports = router