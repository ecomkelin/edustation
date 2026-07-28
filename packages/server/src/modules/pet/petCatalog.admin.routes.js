'use strict'

/**
 * Pet Catalog Admin Routes（2026-06-21 pet-system-v2-ext / 2026-06-22 重构）
 *
 * 挂载在 /api/v1/admin/pet 之下：
 *   /species     /species/:id     /species/:id/removable-check
 *   /consumables /consumables/:id /consumables/:id/removable-check
 *   /level-config (per-org)
 *
 * 2026-06-22 改造：species / consumables 完全平台级共享（去除 per-org override）。
 *   - list / get：任何有 pet.read 的用户都能看（全平台一份）
 *   - create / update：任何有 pet.write 的用户都能改 (2026-07-22: 不再硬门 requirePlatformAdmin,
 *     pet.write 可由平台超管委托给「平台 · 内容主编」)
 *   - removable-check：任何 pet.read
 *   - remove (硬删)：仍只 platform + 密码 —— CLAUDE.md §8.1
 *
 * 2026-07-22: 「写」权限从硬门 requirePlatformAdmin 改用 requirePermission(pet.write).
 *   谁能持有 pet.write ? 仅 isPlatformAdmin (超管) 或被超管 grant 到「平台 · 内容主编」职位.
 *   普通机构管理员无法自助 grant (见 position.service.sensitive-grant 校验).
 *
 * 注意：orgId 仍写入 controller（兼容现有 controller 结构），但 service 不再用它过滤。
 *  —— 但 pet.write 写操作本身不查 org (catalog 是 platform-level)
 */

const express = require('express')
const router = express.Router()
const mws = require('@middlewares')
const c = require('@modules/pet/petCatalog.admin.controller')

// 全部端点要 auth + org context (read-only 也带着 org 上下文以兼容 controller 接口)
router.use(mws.authenticate, mws.requireOrg)

// ─── Species ───
// R-2480 GET /admin/pet/species — 列表
router.get('/species', mws.requirePermission('pet.read'), c.listSpecies)
// R-2481 POST /admin/pet/species — 创建 (2026-07-22: 改用 pet.write 权限)
router.post('/species', mws.requirePermission('pet.write'), c.createSpecies)
// R-2482 GET /admin/pet/species/:id — 详情
router.get('/species/:id', mws.requirePermission('pet.read'), c.getSpecies)
// R-2483 PUT /admin/pet/species/:id — 更新 (2026-07-22: 改用 pet.write 权限)
router.put('/species/:id', mws.requirePermission('pet.write'), c.updateSpecies)
// R-2484 GET /admin/pet/species/:id/removable-check — 预检
router.get('/species/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckSpecies)
// R-2485 DELETE /admin/pet/species/:id — 物理删 (仍 §8.1: 超管 + 密码)
router.delete('/species/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeSpecies)

// ─── Items ───（2026-07-15 装饰系统整体删除；R-2486~2491 DEPRECATED，见 routes-server.md §4.1）

// ─── Consumables ───
// R-2492 GET /admin/pet/consumables
router.get('/consumables', mws.requirePermission('pet.read'), c.listConsumables)
// R-2493 POST /admin/pet/consumables (2026-07-22: 改用 pet.write)
router.post('/consumables', mws.requirePermission('pet.write'), c.createConsumable)
// R-2494 GET /admin/pet/consumables/:id
router.get('/consumables/:id', mws.requirePermission('pet.read'), c.getConsumable)
// R-2495 PUT /admin/pet/consumables/:id (2026-07-22: 改用 pet.write)
router.put('/consumables/:id', mws.requirePermission('pet.write'), c.updateConsumable)
// R-2496 GET /admin/pet/consumables/:id/removable-check
router.get('/consumables/:id/removable-check', mws.requirePermission('pet.read'), c.removableCheckConsumable)
// R-2497 DELETE /admin/pet/consumables/:id — 物理删 (§8.1)
router.delete('/consumables/:id', mws.requirePlatformAdmin, mws.requirePermission('pet.write'), mws.requirePlatformPassword, c.removeConsumable)

// ─── Level Config（per-org 等级配置；机构管理员即可改本机构） ───
// R-2498 GET /admin/pet/level-config
router.get('/level-config', mws.requirePermission('pet.read'), c.getLevelConfig)
// R-2499 PUT /admin/pet/level-config
router.put('/level-config', mws.requirePermission('pet.write'), c.updateLevelConfig)

module.exports = router
