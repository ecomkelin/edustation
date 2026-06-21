'use strict'

/**
 * Pet Catalog Admin Routes（2026-06-21 pet-system-v2-ext）
 *
 * 挂载在 /api/v1/admin/pet 之下：
 *   /species     /species/:id     /species/:id/removable-check
 *   /items       /items/:id       /items/:id/removable-check
 *   /consumables /consumables/:id /consumables/:id/removable-check
 *
 * 权限：CRUD 全部走 pet.write；removable-check 走 pet.read。
 * 高风险删除走 requirePlatformPassword（与 category/subject 等保持一致）。
 */

const express = require('express')
const router = express.Router()
const mws = require('@middlewares')
const c = require('@modules/pet/petCatalog.admin.controller')

// 全部端点要 auth + org context + pet 权限
router.use(mws.authenticate, mws.requireOrg)

// ─── Species ───
router.get('/species', mws.requirePermission('pet.read'), c.listSpecies)
router.post('/species', mws.requirePermission('pet.write'), c.createSpecies)
router.get('/species/:id', mws.requirePermission('pet.read'), c.getSpecies)
router.put('/species/:id', mws.requirePermission('pet.write'), c.updateSpecies)
router.get('/species/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckSpecies)
router.delete('/species/:id', mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeSpecies)

// ─── Items ───
router.get('/items', mws.requirePermission('pet.read'), c.listItems)
router.post('/items', mws.requirePermission('pet.write'), c.createItem)
router.get('/items/:id', mws.requirePermission('pet.read'), c.getItem)
router.put('/items/:id', mws.requirePermission('pet.write'), c.updateItem)
router.get('/items/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckItem)
router.delete('/items/:id', mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeItem)

// ─── Consumables ───
router.get('/consumables', mws.requirePermission('pet.read'), c.listConsumables)
router.post('/consumables', mws.requirePermission('pet.write'), c.createConsumable)
router.get('/consumables/:id', mws.requirePermission('pet.read'), c.getConsumable)
router.put('/consumables/:id', mws.requirePermission('pet.write'), c.updateConsumable)
router.get('/consumables/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckConsumable)
router.delete('/consumables/:id', mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeConsumable)

module.exports = router