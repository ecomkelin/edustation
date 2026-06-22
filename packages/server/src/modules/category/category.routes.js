'use strict'

const router = require('express').Router()
const c = require('./category.controller')
const v = require('./category.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

/* ------------------------------------------------------------------
 * 2026-06 整改: Category 全 per-org (org 字段隔离).
 *   - GET (list/tree/detail/removable-check): 任何登录用户, 按 x-org-id 隔离 (走 requireOrg 拿 req.orgId)
 *   - POST/PUT/DELETE: 机构管理员/教务 (按 body.model 动态选权限码, 见 controller writePermGuard).
 *     删除: 走 requirePlatformPassword 兜底 (与 subject/dict 保持一致, 高风险).
 *
 * 注意: 不同 model 对应不同权限码 (复用引用方权限, 不新增):
 *   - Student  → student.write
 *   - Subject  → subject.write
 *   - LeadTag  → recruit.write
 *   - Channel  → recruit.write
 * 写路由**不能**在 router 层用单一 requirePermission('') — 必须在 controller 内部根据 req.body.model 选.
 *
 * 历史变更:
 *   - 2026-06-15 之前: Category 是平台共享, 写权限仅平台超管.
 *   - 2026-06-15: 整改为 per-org, model enum 移除 'Org' (Org.type 改 String enum),
 *                写权限下放机构 (复用引用方权限).
 * ------------------------------------------------------------------ */

router.use(mws.authenticate, mws.requireOrg)

// R-0600 GET /categories
router.get('/', asyncHandler(c.list))
// R-0608 GET /categories/tree
router.get('/tree', asyncHandler(c.tree))
// R-0601 GET /categories/:id
router.get('/:id', v.idParam, mws.validateRequest, asyncHandler(c.detail))
// R-0605 GET /categories/:id/removable-check
router.get('/:id/removable-check', v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))
// R-0602 POST /categories
router.post('/', v.create, mws.validateRequest, asyncHandler(c.create))
// R-0603 PUT /categories/:id
router.put('/:id', v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 物理删除(「误操」场景):走 requirePlatformPassword 二次确认 + service 内业务互锁
// R-0604 DELETE /categories/:id
router.delete('/:id', v.idParam, mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router