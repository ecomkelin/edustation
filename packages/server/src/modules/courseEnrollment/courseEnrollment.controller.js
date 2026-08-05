'use strict'

const s = require('./courseEnrollment.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
// R-1214: C 端 "我的报名" 列表 — 强制从 req.activeStudentId 取当前激活孩子
// 2026-07-03: 透传 req.query 支持 page/pageSize/status 过滤 (前端全量列表用)
// 2026-08-05: 跨孩子全机构 dump 堵口 (审计 H4)
//   - 之前 `...req.query` 摊到最后 → 客户端可传 ?student=他人 / ?orgId=他机构 覆盖已校验的 student/orgId
//   - 现在强制从中间件挂的 req.activeStudentId 取, 不接受任何 query 覆盖;
//     且 controller 入口 fail-closed: 未挂 activeStudentId (中间件 header 缺失) 直接 400,
//     避免 service 端 `if (student) filter.student = student` 静默漏过滤.
exports.mine = async (req, res) => {
  if (!req.activeStudentId) {
    return res.status(400).json(ApiResponse.fail('缺少 x-active-student-id'))
  }
  // 白名单解构, 严禁透传 student/orgId (防止覆盖)
  const { status, page, pageSize } = req.query
  res.json(ApiResponse.ok(await s.list({
    orgId: req.orgId,
    student: req.activeStudentId,
    status: status || { $ne: 'withdrawn' },
    page, pageSize
  })))
}
// R-1215: C 端 "单课进度" — 聚合 LessonSchedule + LessonAttendance, 学生维度
exports.myProgress = async (req, res) => res.json(ApiResponse.ok(await s.myProgress({
  orgId: req.orgId,
  student: req.activeStudentId,
  courseInstanceId: req.params.courseInstanceId
})))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.create = async (req, res) => res.status(201).json(ApiResponse.created(await s.create({ orgId: req.orgId, ...req.body })))
exports.update = async (req, res) => res.json(ApiResponse.ok(await s.update(req.params.id, req.orgId, req.body)))
exports.setStatus = async (req, res) => res.json(ApiResponse.ok(await s.setStatus({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.remove({
  id: req.params.id,
  orgId: req.orgId
})))
exports.removableCheck = async (req, res) => res.json(ApiResponse.ok(await s.removableCheck(req.params.id, req.orgId)))
