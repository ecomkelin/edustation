'use strict'

const router = require('express').Router()
const c = require('./childLead.controller')
const v = require('./childLead.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

/* ------------------------------------------------------------------
 * 招生试听 - 孩子潜客 (ChildLead) 路由
 *
 * 权限码 (recruit.*):
 *   - recruit.read:   列表/详情/触点时间线/removable-check
 *   - recruit.write:  新建/编辑/记录触点
 *   - recruit.convert: 撤销转化
 * ------------------------------------------------------------------ */
router.use(mws.authenticate, mws.requireOrg)

// 列表
router.get('/', mws.requirePermission('recruit.read'), v.list, mws.validateRequest, asyncHandler(c.list))
// 详情
router.get('/:id', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.detail))
// 预检 (删除)
router.get('/:id/removable-check', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))
// 触点时间线
router.get('/:id/activities', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.listActivities))

// 单创建 (parentId 必填; 走"加一个孩子"流程)
router.post('/', mws.requirePermission('recruit.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// 编辑
router.put('/:id', mws.requirePermission('recruit.write'), v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 记录触点
router.post('/:id/activities', mws.requirePermission('recruit.write'), v.idParam, v.createActivity, mws.validateRequest, asyncHandler(c.createActivity))
// 编辑触点 (自己 24h 内 / 超管; 不动 byUser)
router.put('/:id/activities/:actId', mws.requirePermission('recruit.write'), v.actIdParam, v.updateActivity, mws.validateRequest, asyncHandler(c.updateActivity))
// 物理删触点 (高风险): 平台超管 + 密码, 无软删
router.delete('/:id/activities/:actId', mws.requirePlatformPassword, v.actIdParam, mws.validateRequest, asyncHandler(c.removeActivity))
// 撤销转化 (5 分钟内)
router.post('/:id/unconvert', mws.requirePermission('recruit.convert'), v.idParam, mws.validateRequest, asyncHandler(c.unconvert))

// 物理删除 (高风险): 平台超管 + 密码
router.delete('/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.remove))

module.exports = router
