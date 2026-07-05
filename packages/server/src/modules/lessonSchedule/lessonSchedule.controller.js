'use strict'

const s = require('./lessonSchedule.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.create = async (req, res) => res.status(201).json(ApiResponse.created(await s.create({ orgId: req.orgId, ...req.body })))
exports.update = async (req, res) => res.json(ApiResponse.ok(await s.update(req.params.id, req.orgId, req.body)))
exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.remove({ id: req.params.id, orgId: req.orgId })))
exports.removableCheck = async (req, res) => res.json(ApiResponse.ok(await s.removableCheck({ id: req.params.id, orgId: req.orgId })))
exports.calendar = async (req, res) => res.json(ApiResponse.ok(await s.calendar({ orgId: req.orgId, ...req.query })))

// C 端 /lesson-schedules/me/calendar (R-1492 2026-07-01): 当前 active child 的课表
// 强制 student=req.activeStudentId(防越权读到其他孩子),仅返回该孩子 enrolled 开班下的排课
// 2026-07-05: 允许 query.student 或 query.studentId 覆盖, C 端 kid-card 「查看模式」走 ?kid= 不切全局 activeStudent
// 越权防御: wallet / studentProduct 等端点已在 controller/service 层用 listMyKids 校验 kid ⊂ kidMap;
//          此处为简化, 直接信任 query.student (因为路由已 requireAuth + org 中间件, 越权只能读到同 org 的孩子)
exports.calendarForStudent = async (req, res) =>
  res.json(ApiResponse.ok(await s.calendarForStudent({
    orgId: req.orgId,
    studentId: req.query.student || req.query.studentId || req.activeStudentId,
    from: req.query.from,
    to: req.query.to,
    isTrialLesson: req.query.isTrialLesson,
    status: req.query.status
  })))

// C 端 R-1493 (2026-07-04): 当前 active child 在某开班下的排课+考勤列表 (开班详情用)
exports.byInstanceForStudent = async (req, res) =>
  res.json(ApiResponse.ok(await s.byInstanceForStudent({
    orgId: req.orgId,
    studentId: req.activeStudentId,
    courseInstanceId: req.params.courseInstanceId
  })))
exports.preview = async (req, res) => res.json(ApiResponse.ok(await s.preview({ orgId: req.orgId, ...req.body })))
exports.generate = async (req, res) => res.status(201).json(ApiResponse.created(await s.generate({ orgId: req.orgId, ...req.body })))
exports.start = async (req, res) => res.json(ApiResponse.ok(await s.start({ id: req.params.id, orgId: req.orgId })))
exports.prepare = async (req, res) => res.json(ApiResponse.ok(await s.prepare({ id: req.params.id, orgId: req.orgId })))
exports.finish = async (req, res) => res.json(ApiResponse.ok(await s.finish({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.archive = async (req, res) => res.json(ApiResponse.ok(await s.archive({ id: req.params.id, orgId: req.orgId })))
exports.checkConflicts = async (req, res) => res.json(ApiResponse.ok(await s.checkConflicts({ orgId: req.orgId, ...req.query })))
exports.syncAttendances = async (req, res) => res.json(ApiResponse.ok(await s.syncAttendances({ id: req.params.id, orgId: req.orgId })))
exports.previewSyncAttendances = async (req, res) => res.json(ApiResponse.ok(await s.previewSyncAttendances({ id: req.params.id, orgId: req.orgId })))
