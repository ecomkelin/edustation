'use strict'

const s = require('./trialBooking.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await s.list({ orgId: req.orgId, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await s.detail(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.create = async (req, res) => {
  const data = await s.create({ orgId: req.orgId, currentUser: req.user, body: req.body })
  res.status(201).json(ApiResponse.created(data))
}

// 2026-06-20: 为已有 childLead 单独创建一笔 awaiting_schedule 预约
//   与 create (attached 跟班) 并列, 但语义不同 — 这里走 solo 路径, 不排时间
exports.createForChild = async (req, res) => {
  const data = await s.createForChild({ orgId: req.orgId, currentUser: req.user, body: req.body })
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  const data = await s.update(req.params.id, req.orgId, req.body)
  res.json(ApiResponse.ok(data))
}

exports.remove = async (req, res) => {
  const data = await s.remove({ id: req.params.id, orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}

exports.removableCheck = async (req, res) => {
  const data = await s.removableCheck({ id: req.params.id, orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}

exports.batchSchedule = async (req, res) => {
  const data = await s.batchSchedule({ orgId: req.orgId, currentUser: req.user, body: req.body })
  res.status(201).json(ApiResponse.created(data))
}

exports.checkIn = async (req, res) => {
  const data = await s.checkIn({ id: req.params.id, orgId: req.orgId, currentUser: req.user, body: req.body })
  res.json(ApiResponse.ok(data))
}

exports.complete = async (req, res) => {
  const data = await s.complete({ id: req.params.id, orgId: req.orgId, currentUser: req.user, body: req.body })
  res.json(ApiResponse.ok(data))
}

exports.convertPreview = async (req, res) => {
  const data = await s.convertPreview({ id: req.params.id, orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}

exports.convert = async (req, res) => {
  const data = await s.convert({ id: req.params.id, orgId: req.orgId, currentUser: req.user })
  res.json(ApiResponse.ok(data))
}

// 2026-06-16: 替换 markNoShow / reschedule; 业务上对"已约"做精细调整
exports.rescheduleTime = async (req, res) => {
  const data = await s.rescheduleTime({ id: req.params.id, orgId: req.orgId, currentUser: req.user, body: req.body })
  res.json(ApiResponse.ok(data))
}

exports.revertToUnscheduled = async (req, res) => {
  const data = await s.revertToUnscheduled({ id: req.params.id, orgId: req.orgId, currentUser: req.user })
  res.json(ApiResponse.ok(data))
}

// 2026-06-16: cancelled tab 后的"再约一次" (旧 booking 留作审计, 新建一笔)
exports.rescheduleFromCancelled = async (req, res) => {
  const data = await s.rescheduleFromCancelled({ id: req.params.id, orgId: req.orgId, currentUser: req.user, body: req.body })
  res.json(ApiResponse.ok(data))
}
