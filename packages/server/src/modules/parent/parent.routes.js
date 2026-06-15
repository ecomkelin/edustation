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
router.get('/', mws.requirePermission('recruit.read'), v.list, mws.validateRequest, asyncHandler(c.list))
// 详情
router.get('/:id', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.detail))
// 预检 (删除)
router.get('/:id/removable-check', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))
// 触点时间线 (聚合该家长下所有孩子的触点)
router.get('/:id/activities', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.listActivities))

// 创建家长 + 第一个孩子 (1 API 核心)
router.post('/with-child', mws.requirePermission('recruit.write'), v.withChild, mws.validateRequest, asyncHandler(c.withChild))
// 同家长加孩
router.post('/:id/children', mws.requirePermission('recruit.write'), v.idParam, v.addChild, mws.validateRequest, asyncHandler(c.addChild))
// 编辑基础信息 (phone/lifecycle/tags 走专门端点)
router.put('/:id', mws.requirePermission('recruit.write'), v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 手动重算 lifecycle
router.post('/:id/recompute-lifecycle', mws.requirePermission('recruit.write'), v.idParam, mws.validateRequest, asyncHandler(c.recompute))

// 标签
router.post('/:id/tags', mws.requirePermission('recruit.write'), v.idParam, v.addTag, mws.validateRequest, asyncHandler(c.addTag))
router.delete('/:id/tags/:tagId', mws.requirePermission('recruit.write'), v.tagIdParam, mws.validateRequest, asyncHandler(c.removeTag))

// 物理删除 (高风险): 平台超管 + 密码
router.delete('/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.remove))

module.exports = router
