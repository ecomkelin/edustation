'use strict'

const s = require('./courseEnrollment.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
// R-1214: C 端 "我的报名" 列表 — 强制从 req.activeStudentId 取当前激活孩子
exports.mine = async (req, res) => res.json(ApiResponse.ok(await s.list({
  orgId: req.orgId,
  student: req.activeStudentId,
  status: { $ne: 'withdrawn' }   // 排除已退报名
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
