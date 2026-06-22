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

// ─── Items ───
// R-2486 GET /admin/pet/items
router.get('/items', mws.requirePermission('pet.read'), c.listItems)
// R-2487 POST /admin/pet/items
router.post('/items', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.createItem)
// R-2488 GET /admin/pet/items/:id
router.get('/items/:id', mws.requirePermission('pet.read'), c.getItem)
// R-2489 PUT /admin/pet/items/:id
router.put('/items/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.updateItem)
// R-2490 GET /admin/pet/items/:id/removable-check
router.get('/items/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckItem)
// R-2491 DELETE /admin/pet/items/:id
router.delete('/items/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeItem)

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

module.exports = router