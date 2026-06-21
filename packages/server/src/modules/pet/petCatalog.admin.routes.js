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
router.get('/species', mws.requirePermission('pet.read'), c.listSpecies)
router.post('/species', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.createSpecies)
router.get('/species/:id', mws.requirePermission('pet.read'), c.getSpecies)
router.put('/species/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.updateSpecies)
router.get('/species/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckSpecies)
router.delete('/species/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeSpecies)

// ─── Items ───
router.get('/items', mws.requirePermission('pet.read'), c.listItems)
router.post('/items', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.createItem)
router.get('/items/:id', mws.requirePermission('pet.read'), c.getItem)
router.put('/items/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.updateItem)
router.get('/items/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckItem)
router.delete('/items/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeItem)

// ─── Consumables ───
router.get('/consumables', mws.requirePermission('pet.read'), c.listConsumables)
router.post('/consumables', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.createConsumable)
router.get('/consumables/:id', mws.requirePermission('pet.read'), c.getConsumable)
router.put('/consumables/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), c.updateConsumable)
router.get('/consumables/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckConsumable)
router.delete('/consumables/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeConsumable)

module.exports = router