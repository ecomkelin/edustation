'use strict'

const router = require('express').Router()
const c = require('./lessonSchedule.controller')
const v = require('./lessonSchedule.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

// R-1450 GET /lesson-schedules/calendar
router.get('/calendar', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.calendar))
// 冲突预检（独立 GET，方便编辑对话框在保存前调用）
// R-1451 GET /lesson-schedules/conflicts
router.get('/conflicts', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.checkConflicts))
// R-1400 GET /lesson-schedules
router.get('/', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.list))
// R-1401 GET /lesson-schedules/:id
router.get('/:id', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.detail))
// R-1405 GET /lesson-schedules/:id/removable-check
router.get('/:id/removable-check', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.removableCheck))
// 单条创建
// R-1402 POST /lesson-schedules
router.post('/', mws.requirePermission('lessonSchedule.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// 批量：preview（不入库） / generate（入库）
// R-1440 POST /lesson-schedules/preview
router.post('/preview', mws.requirePermission('lessonSchedule.write'), v.preview, mws.validateRequest, asyncHandler(c.preview))
// R-1441 POST /lesson-schedules/generate
router.post('/generate', mws.requirePermission('lessonSchedule.write'), v.generate, mws.validateRequest, asyncHandler(c.generate))
// 单条更新
// R-1403 PUT /lesson-schedules/:id
router.put('/:id', mws.requirePermission('lessonSchedule.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 状态流转：prepare / start / finish / archive / cancel
//   - prepare: 仅排课列表(scheduled) → preparing 走这个端点
//   - start/finish/archive: 排课列表 + 上课表共用
// R-1420 POST /lesson-schedules/:id/prepare
router.post('/:id/prepare', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.prepare))
// R-1421 POST /lesson-schedules/:id/start
router.post('/:id/start', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.start))
// R-1422 POST /lesson-schedules/:id/finish
router.post('/:id/finish', mws.requirePermission('lessonSchedule.write'), v.finish, mws.validateRequest, asyncHandler(c.finish))
// R-1424 POST /lesson-schedules/:id/archive
router.post('/:id/archive', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.archive))
// 「补齐名单」：为该排课补建尚未生成考勤的已报名学生（修 prepare 之后报名/购课/赠课漏生成考勤的 bug）
// R-1425 POST /lesson-schedules/:id/sync-attendances
router.post('/:id/sync-attendances', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.syncAttendances))
// 「补齐名单」预览：统计"已 enrolled 且本排课下尚无非 makeup 考勤"的学生数；UI 用此决定按钮显隐与徽标
// R-1442 GET /lesson-schedules/:id/sync-attendances/preview
router.get('/:id/sync-attendances/preview', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.previewSyncAttendances))
// 物理删除(「误操」场景):超管+密码二次确认;service 校验:
  //  - 无「已消课」考勤(否则破坏课包账目)
  //  - 无作品挂在本排课下
// R-1404 DELETE /lesson-schedules/:id
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
