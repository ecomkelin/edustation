'use strict'

const router = require('express').Router()
const c = require('./parent.controller')
const v = require('./parent.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

/* ------------------------------------------------------------------
 * 招生试听 - 家长账户 (Parent) 路由
 *
 * 权限码 (recruit.*):
 *   - recruit.read:   列表/详情/触点时间线/removable-check
 *   - recruit.write:  新建/编辑/加孩/标签/lifecycle 重算
 * ------------------------------------------------------------------ */
router.use(mws.authenticate, mws.requireOrg)

// 列表
// R-2500 GET /parents
router.get('/', mws.requirePermission('recruit.read'), v.list, mws.validateRequest, asyncHandler(c.list))
// 详情
// R-2501 GET /parents/:id
router.get('/:id', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.detail))
// 家长画像 (2026-06 新增) — 挂在 UserOrgRel 上, 跨机构独立
// R-2506 GET /parents/:id/profile
router.get('/:id/profile', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.getProfile))
// R-2507 PUT /parents/:id/profile
router.put('/:id/profile', mws.requirePermission('recruit.write'), v.idParam, v.setProfile, mws.validateRequest, asyncHandler(c.setProfile))
// 预检 (删除)
// R-2505 GET /parents/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))
// 触点时间线 (聚合该家长下所有孩子的触点)
// R-2510 GET /parents/:id/activities
router.get('/:id/activities', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.listActivities))

// 创建家长 + 第一个孩子 (1 API 核心)
// R-2541 POST /parents/with-child
router.post('/with-child', mws.requirePermission('recruit.write'), v.withChild, mws.validateRequest, asyncHandler(c.withChild))
// 批量导入潜客 (2026-06-20) — Excel 上传后, 前端调用; 部分成功模式
// R-2542 POST /parents/bulk-import
router.post('/bulk-import', mws.requirePermission('recruit.write'), v.bulkImport, mws.validateRequest, asyncHandler(c.bulkImport))
// 同家长加孩
// R-2543 POST /parents/:id/children
router.post('/:id/children', mws.requirePermission('recruit.write'), v.idParam, v.addChild, mws.validateRequest, asyncHandler(c.addChild))
// 编辑基础信息 (phone/lifecycle/tags 走专门端点)
// R-2503 PUT /parents/:id
router.put('/:id', mws.requirePermission('recruit.write'), v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 手动重算 lifecycle
// R-2544 POST /parents/:id/recompute-lifecycle
router.post('/:id/recompute-lifecycle', mws.requirePermission('recruit.write'), v.idParam, mws.validateRequest, asyncHandler(c.recompute))

// 标签
// R-2545 POST /parents/:id/tags
router.post('/:id/tags', mws.requirePermission('recruit.write'), v.idParam, v.addTag, mws.validateRequest, asyncHandler(c.addTag))
// R-2546 DELETE /parents/:id/tags/:tagId
router.delete('/:id/tags/:tagId', mws.requirePermission('recruit.write'), v.tagIdParam, mws.validateRequest, asyncHandler(c.removeTag))

// 物理删除 (高风险): 平台超管 + 密码
// R-2504 DELETE /parents/:id
router.delete('/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.remove))

module.exports = router
