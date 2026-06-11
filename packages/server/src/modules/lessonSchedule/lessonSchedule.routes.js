'use strict'

const router = require('express').Router()
const c = require('./lessonSchedule.controller')
const v = require('./lessonSchedule.validator')
const mws = require('@middlewares')
const asyncHandler = require('@utils/asyncHandler')

router.use(mws.authenticate, mws.requireOrg)

router.get('/calendar', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.calendar))
// 冲突预检（独立 GET，方便编辑对话框在保存前调用）
router.get('/conflicts', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.checkConflicts))
router.get('/', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.list))
router.get('/:id', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.detail))
// 单条创建
router.post('/', mws.requirePermission('lessonSchedule.write'), v.create, mws.validateRequest, asyncHandler(c.create))
// 批量：preview（不入库） / generate（入库）
router.post('/preview', mws.requirePermission('lessonSchedule.write'), v.preview, mws.validateRequest, asyncHandler(c.preview))
router.post('/generate', mws.requirePermission('lessonSchedule.write'), v.generate, mws.validateRequest, asyncHandler(c.generate))
// 单条更新
router.put('/:id', mws.requirePermission('lessonSchedule.write'), v.update, mws.validateRequest, asyncHandler(c.update))
// 状态流转：prepare / start / finish / archive / cancel
//   - prepare: 仅排课列表(scheduled) → preparing 走这个端点
//   - start/finish/archive: 排课列表 + 上课表共用
router.post('/:id/prepare', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.prepare))
router.post('/:id/start', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.start))
router.post('/:id/finish', mws.requirePermission('lessonSchedule.write'), v.finish, mws.validateRequest, asyncHandler(c.finish))
router.post('/:id/archive', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.archive))
// 「补齐名单」：为该排课补建尚未生成考勤的已报名学生（修 prepare 之后报名/购课/赠课漏生成考勤的 bug）
router.post('/:id/sync-attendances', mws.requirePermission('lessonSchedule.write'), asyncHandler(c.syncAttendances))
// 「补齐名单」预览：统计"已 enrolled 且本排课下尚无非 makeup 考勤"的学生数；UI 用此决定按钮显隐与徽标
router.get('/:id/sync-attendances/preview', mws.requirePermission('lessonSchedule.read'), asyncHandler(c.previewSyncAttendances))
// 物理删除(「误操」场景):超管+密码二次确认;service 校验:
  //  - 无「已消课」考勤(否则破坏课包账目)
  //  - 无作品挂在本排课下
router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))

module.exports = router
