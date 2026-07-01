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
exports.calendarForStudent = async (req, res) =>
  res.json(ApiResponse.ok(await s.calendarForStudent({
    orgId: req.orgId,
    studentId: req.activeStudentId,
    ...req.query
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
