'use strict'

const service = require('./student.service')
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
  const data = await service.create({ orgId: req.orgId, ...req.body })
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
  const data = await service.setGuardians(req.params.id, req.orgId, req.body.guardians)
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
