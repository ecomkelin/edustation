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
// 2026-08-05: 跨孩子 IDOR 堵口 (审计 H4)
//   之前 service 端无监护人校验, 家长 `?student=他人` 可读同 org 任意孩子的课表
//   (含老师手机/教室/整张时间表). 现在 controller 入口 fail-closed + 用 kidMap 校验 query.student 必须 ∈ user 名下.
const Student = require('@models/Student.model')

exports.calendarForStudent = async (req, res) => {
  if (!req.activeStudentId && !req.query.student && !req.query.studentId) {
    return res.status(400).json(ApiResponse.fail('缺少 x-active-student-id 或 query.student'))
  }
  const requestedId = req.query.student || req.query.studentId || req.activeStudentId
  // 校验 requestedId 必须是当前 user 的监护 kid (kid ⊂ guardians=user.id 的 Student)
  const kid = await Student.findOne({
    _id: requestedId,
    guardians: req.user.id,
    isActive: true
  }).select('_id org').lean()
  if (!kid) {
    return res.status(403).json(ApiResponse.fail('该孩子不在您的监护人列表中'))
  }
  // 顺便: requestedId 必须与 kid.org 同 req.orgId (防跨机构, 中间件已挡 user 但双保险)
  if (String(kid.org) !== String(req.orgId)) {
    return res.status(403).json(ApiResponse.fail('该孩子不属于当前机构'))
  }
  res.json(ApiResponse.ok(await s.calendarForStudent({
    orgId: req.orgId,
    studentId: requestedId,
    from: req.query.from,
    to: req.query.to,
    isTrialLesson: req.query.isTrialLesson,
    status: req.query.status
  })))
}

// C 端 R-1493 (2026-07-04): 当前 active child 在某开班下的排课+考勤列表 (开班详情用)
exports.byInstanceForStudent = async (req, res) =>
  res.json(ApiResponse.ok(await s.byInstanceForStudent({
    orgId: req.orgId,
    studentId: req.activeStudentId,
    courseInstanceId: req.params.courseInstanceId
  })))

// C 端 R-1494 (2026-07-12): 当前 active child 的单节排课详情 (schedule/detail.vue)
// 不走 requirePermission, 仅校验 activeStudent 在该 schedule 所属开班有有效报名
// 修复: schedule/detail.vue 调业务端 /:id 403 → "课程信息不存在"
exports.byScheduleIdForStudent = async (req, res) =>
  res.json(ApiResponse.ok(await s.byScheduleIdForStudent({
    orgId: req.orgId,
    studentId: req.activeStudentId,
    scheduleId: req.params.id
  })))
exports.preview = async (req, res) => res.json(ApiResponse.ok(await s.preview({ orgId: req.orgId, ...req.body })))
exports.generate = async (req, res) => res.status(201).json(ApiResponse.created(await s.generate({ orgId: req.orgId, ...req.body })))
exports.start = async (req, res) => res.json(ApiResponse.ok(await s.start({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.prepare = async (req, res) => res.json(ApiResponse.ok(await s.prepare({ id: req.params.id, orgId: req.orgId })))
exports.finish = async (req, res) => res.json(ApiResponse.ok(await s.finish({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.archive = async (req, res) => res.json(ApiResponse.ok(await s.archive({ id: req.params.id, orgId: req.orgId })))
exports.checkConflicts = async (req, res) => res.json(ApiResponse.ok(await s.checkConflicts({ orgId: req.orgId, ...req.query })))
exports.syncAttendances = async (req, res) => res.json(ApiResponse.ok(await s.syncAttendances({ id: req.params.id, orgId: req.orgId })))
exports.previewSyncAttendances = async (req, res) => res.json(ApiResponse.ok(await s.previewSyncAttendances({ id: req.params.id, orgId: req.orgId })))
