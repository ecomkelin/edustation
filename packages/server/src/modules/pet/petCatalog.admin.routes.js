'use strict'

/**
 * Pet Catalog Admin Routes（2026-06-21 pet-system-v2-ext / 2026-06-22 重构）
 *
 * 挂载在 /api/v1/admin/pet 之下：
 *   /species     /species/:id     /species/:id/removable-check
 *   /items       /items/:id       /items/:id/removable-check
 *   /consumables /consumables/:id /consumables/:id/removable-check
 *
 * 2026-06-22 改造：catalog 完全平台级共享（去除 per-org override）。
 *   - list / get：任何有 pet.read 的用户都能看（全平台一份）
 *   - create / update：仅平台超管（requirePlatformAdmin）
 *   - removable-check：任何 pet.read
 *   - remove：仅平台超管 + 输密码（requirePlatformAdmin + requirePlatformPassword）
 *
 * 注意：orgId 仍写入 controller（兼容现有 controller 结构），但 service 不再用它过滤。
 */

const express = require('express')
const router = express.Router()
const mws = require('@middlewares')
const c = require('@modules/pet/petCatalog.admin.controller')

// 全部端点要 auth + org context
router.use(mws.authenticate, mws.requireOrg)

// ─── Species ───
// R-2480 GET /admin/pet/species
router.get('/species', mws.requirePermission('pet.read'), c.listSpecies)
// R-2481 POST /admin/pet/species
router.post('/species', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.createSpecies)
// R-2482 GET /admin/pet/species/:id
router.get('/species/:id', mws.requirePermission('pet.read'), c.getSpecies)
// R-2483 PUT /admin/pet/species/:id
router.put('/species/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.updateSpecies)
// R-2484 GET /admin/pet/species/:id/removable-check
router.get('/species/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckSpecies)
// R-2485 DELETE /admin/pet/species/:id
router.delete('/species/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeSpecies)

// ─── Items ───（2026-07-15 装饰系统整体删除；R-2486~2491 DEPRECATED，见 routes-server.md §4.1）

// ─── Consumables ───
// R-2492 GET /admin/pet/consumables
router.get('/consumables', mws.requirePermission('pet.read'), c.listConsumables)
// R-2493 POST /admin/pet/consumables
router.post('/consumables', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.createConsumable)
// R-2494 GET /admin/pet/consumables/:id
router.get('/consumables/:id', mws.requirePermission('pet.read'), c.getConsumable)
// R-2495 PUT /admin/pet/consumables/:id
router.put('/consumables/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.updateConsumable)
// R-2496 GET /admin/pet/consumables/:id/removable-check
router.get('/consumables/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckConsumable)
// R-2497 DELETE /admin/pet/consumables/:id
router.delete('/consumables/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeConsumable)

// ─── Level Config（per-org 等级配置；机构管理员即可改本机构） ───
// R-2498 GET /admin/pet/level-config
router.get('/level-config', mws.requirePermission('pet.read'), c.getLevelConfig)
// R-2499 PUT /admin/pet/level-config
router.put('/level-config', mws.requirePermission('pet.write'), c.updateLevelConfig)

module.exports = router