'use strict'

const router = require('express').Router()
const c = require('./trialBooking.controller')
const v = require('./trialBooking.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

/* ------------------------------------------------------------------
 * 招生试听 - 试听预约 (TrialBooking) 路由
 *
 * 权限码 (recruit.*):
 *   - recruit.read:   列表/详情/removable-check
 *   - recruit.write:  批量排课/打卡/完成/再约
 *   - recruit.convert: 转化预览/转化执行
 * ------------------------------------------------------------------ */
router.use(mws.authenticate, mws.requireOrg)

// 列表
router.get('/', mws.requirePermission('recruit.read'), v.list, mws.validateRequest, asyncHandler(c.list))
// 详情
router.get('/:id', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.detail))
// 预检 (删除)
router.get('/:id/removable-check', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))

// 2026-06-20: 为已有 childLead 单独创建一笔 awaiting_schedule 预约 (solo, 不排时间; 排课走 batch-schedule)
// 2026-06-21: 删 POST / (attached 跟班创建) — 试听课完全独立于排课系统
router.post('/for-child', mws.requirePermission('recruit.write'), v.createForChild, mws.validateRequest, asyncHandler(c.createForChild))
// 批量排课 (核心)
router.post('/batch-schedule', mws.requirePermission('recruit.write'), v.batchSchedule, mws.validateRequest, asyncHandler(c.batchSchedule))
// 编辑 (cancelled/remark)
router.put('/:id', mws.requirePermission('recruit.write'), v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 到店打卡
router.post('/:id/check-in', mws.requirePermission('recruit.write'), v.idParam, v.checkIn, mws.validateRequest, asyncHandler(c.checkIn))
// 完成
router.post('/:id/complete', mws.requirePermission('recruit.write'), v.idParam, v.complete, mws.validateRequest, asyncHandler(c.complete))
// 改预约时间 (scheduled → scheduled, 仅改 scheduledAt/teacher/room; 2026-06-16 替代 markNoShow+reschedule)
router.post('/:id/reschedule-time', mws.requirePermission('recruit.write'), v.idParam, v.rescheduleTime, mws.validateRequest, asyncHandler(c.rescheduleTime))
// 退回未约 (scheduled → awaiting_schedule; 2026-06-16 新增)
router.post('/:id/revert-to-unscheduled', mws.requirePermission('recruit.write'), v.idParam, mws.validateRequest, asyncHandler(c.revertToUnscheduled))
// 取消后再约一次 (cancelled → 新 awaiting_schedule + 走 batchSchedule; 2026-06-16 新增)
router.post('/:id/reschedule-from-cancelled', mws.requirePermission('recruit.write'), v.idParam, v.rescheduleFromCancelled, mws.validateRequest, asyncHandler(c.rescheduleFromCancelled))
// 转化预览
router.post('/:id/convert-preview', mws.requirePermission('recruit.convert'), v.idParam, mws.validateRequest, asyncHandler(c.convertPreview))
// 转化执行
router.post('/:id/convert', mws.requirePermission('recruit.convert'), v.idParam, mws.validateRequest, asyncHandler(c.convert))

// 物理删除 (高风险)
router.delete('/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.remove))

module.exports = router
