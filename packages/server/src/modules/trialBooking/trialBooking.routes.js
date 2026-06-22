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
// R-2700 GET /trial-bookings
router.get('/', mws.requirePermission('recruit.read'), v.list, mws.validateRequest, asyncHandler(c.list))
// 详情
// R-2701 GET /trial-bookings/:id
router.get('/:id', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.detail))
// 预检 (删除)
// R-2705 GET /trial-bookings/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('recruit.read'), v.idParam, mws.validateRequest, asyncHandler(c.removableCheck))

// 2026-06-20: 为已有 childLead 单独创建一笔 awaiting_schedule 预约 (solo, 不排时间; 排课走 batch-schedule)
// 2026-06-21: 删 POST / (attached 跟班创建) — 试听课完全独立于排课系统
// R-2741 POST /trial-bookings/for-child
router.post('/for-child', mws.requirePermission('recruit.write'), v.createForChild, mws.validateRequest, asyncHandler(c.createForChild))
// 批量排课 (核心)
// R-2742 POST /trial-bookings/batch-schedule
router.post('/batch-schedule', mws.requirePermission('recruit.write'), v.batchSchedule, mws.validateRequest, asyncHandler(c.batchSchedule))
// 编辑 (cancelled/remark)
// R-2703 PUT /trial-bookings/:id
router.put('/:id', mws.requirePermission('recruit.write'), v.idParam, v.update, mws.validateRequest, asyncHandler(c.update))
// 到店打卡
// R-2726 POST /trial-bookings/:id/check-in
router.post('/:id/check-in', mws.requirePermission('recruit.write'), v.idParam, v.checkIn, mws.validateRequest, asyncHandler(c.checkIn))
// 完成
// R-2727 POST /trial-bookings/:id/complete
router.post('/:id/complete', mws.requirePermission('recruit.write'), v.idParam, v.complete, mws.validateRequest, asyncHandler(c.complete))
// 改预约时间 (scheduled → scheduled, 仅改 scheduledAt/teacher/room; 2026-06-16 替代 markNoShow+reschedule)
// R-2743 POST /trial-bookings/:id/reschedule-time
router.post('/:id/reschedule-time', mws.requirePermission('recruit.write'), v.idParam, v.rescheduleTime, mws.validateRequest, asyncHandler(c.rescheduleTime))
// 退回未约 (scheduled → awaiting_schedule; 2026-06-16 新增)
// R-2744 POST /trial-bookings/:id/revert-to-unscheduled
router.post('/:id/revert-to-unscheduled', mws.requirePermission('recruit.write'), v.idParam, mws.validateRequest, asyncHandler(c.revertToUnscheduled))
// 取消后再约一次 (cancelled → 新 awaiting_schedule + 走 batchSchedule; 2026-06-16 新增)
// R-2745 POST /trial-bookings/:id/reschedule-from-cancelled
router.post('/:id/reschedule-from-cancelled', mws.requirePermission('recruit.write'), v.idParam, mws.validateRequest, asyncHandler(c.rescheduleFromCancelled))
// 转化预览
// R-2740 POST /trial-bookings/:id/convert-preview
router.post('/:id/convert-preview', mws.requirePermission('recruit.convert'), v.idParam, mws.validateRequest, asyncHandler(c.convertPreview))
// 转化执行
// R-2761 POST /trial-bookings/:id/convert
router.post('/:id/convert', mws.requirePermission('recruit.convert'), v.idParam, mws.validateRequest, asyncHandler(c.convert))

// 物理删除 (高风险)
// R-2704 DELETE /trial-bookings/:id
router.delete('/:id', mws.requirePlatformPassword, v.idParam, mws.validateRequest, asyncHandler(c.remove))

module.exports = router
