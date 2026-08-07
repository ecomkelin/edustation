'use strict'

const service = require('./student.service')
const profile = require('./student.profile')
const overviewService = require('./studentOverview.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await service.list({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await service.detail(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.create = async (req, res) => {
  const data = await service.create({ orgId: req.orgId, currentUser: req.user, ...req.body })
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  const data = await service.update(req.params.id, req.orgId, req.body)
  res.json(ApiResponse.ok(data))
}

exports.remove = async (req, res) => {
  const data = await service.remove(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.removableCheck = async (req, res) => {
  const data = await service.removableCheck(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.setGuardians = async (req, res) => {
  const data = await service.setGuardians(req.params.id, req.orgId, req.body.guardians, req.user)
  res.json(ApiResponse.ok(data))
}

// 切换学员黑名单（isBlocked=true/false），仅超管
exports.setBlocked = async (req, res) => {
  const data = await service.setBlocked(req.params.id, req.orgId, req.body.isBlocked, req.body.reason)
  res.json(ApiResponse.ok(data))
}

// 家长查自己孩子
exports.me = async (req, res) => {
  const data = await service.listForGuardian({ orgId: req.orgId, userId: req.user.id })
  res.json(ApiResponse.ok(data))
}

// 2026-07-05: 家长查自己多个孩子的 stat 聚合 (剩余课时 / 积分 / 近 7 天课程)
// 走 /students/me/stats; 旧 me 端点只返基础信息不含 stat
exports.myStats = async (req, res) => {
  const data = await service.listMyKidsStats({ orgId: req.orgId, userId: req.user.id })
  res.json(ApiResponse.ok(data))
}

// R-0474 GET /students/me/profile
// 2026-07-11: 家长查自己孩子的学习画像 (C 端首页 loadProfile 用)
//   - 跳过 requirePermission, 仅依赖 activeStudent 中间件校验 "x-active-student-id 是否属于 req.user 监护人"
//   - 解决: 家长 Position 移除 student.read 后, 调 /students/:id/profile 403
//   - 行为: activeStudentId 由前端从 Pinia student store 取, 通过 x-active-student-id 头传入
exports.myProfile = async (req, res) => {
  const data = await service.getMyProfile({
    userId: req.user.id,
    studentId: req.activeStudentId,
    orgId: req.orgId
  })
  res.json(ApiResponse.ok(data))
}

// === 学生学习画像 (2026-06 新增) ===
exports.getProfile = async (req, res) => {
  const data = await profile.getProfile(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}
exports.setProfile = async (req, res) => {
  const data = await profile.setProfile(req.params.id, req.orgId, req.body, req.user)
  res.json(ApiResponse.ok(data))
}

// === 学生详情页 (2026-08-07 新增) ===
// R-0408 GET /students/:id/overview
exports.overview = async (req, res) => {
  const data = await overviewService.overview({ studentId: req.params.id, orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}
// R-0409 GET /students/:id/related/:domain
exports.related = async (req, res) => {
  const data = await overviewService.related({
    studentId: req.params.id,
    orgId: req.orgId,
    domain: req.params.domain,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(data))
}
