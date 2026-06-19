'use strict'

const service = require('./user.service')
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
  const data = await service.update(req.params.id, req.body)
  res.json(ApiResponse.ok(data))
}

exports.remove = async (req, res) => {
  await service.remove(req.params.id, req.orgId)
  res.json(ApiResponse.ok())
}

exports.removableCheck = async (req, res) => {
  const data = await service.removableCheck(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.changePassword = async (req, res) => {
  await service.changePassword(req.user.id, req.body.oldPassword, req.body.newPassword)
  res.json(ApiResponse.ok())
}

exports.resetPassword = async (req, res) => {
  await service.resetPassword(req.params.id, req.body.newPassword)
  res.json(ApiResponse.ok())
}

exports.setPositions = async (req, res) => {
  const data = await service.setPositions(req.params.id, req.orgId, req.body.positions)
  res.json(ApiResponse.ok(data))
}

exports.lookupByMobile = async (req, res) => {
  const data = await service.lookupByMobile(req.query.mobile, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.attachToOrg = async (req, res) => {
  const data = await service.attachToOrg(
    req.params.id,
    req.orgId,
    req.body.positions || [],
    !!req.body.isMain
  )
  res.status(201).json(ApiResponse.created(data))
}

// 切换用户黑名单（isBlocked=true/false），仅超管
exports.setBlocked = async (req, res) => {
  const data = await service.setBlocked(req.params.id, req.body.isBlocked, req.body.reason)
  res.json(ApiResponse.ok(data))
}

// 游离用户（2026-06）: 不属于任何机构的孤儿账号管理, 仅平台超管
exports.listUnaffiliated = async (req, res) => {
  const data = await service.listUnaffiliated(req.query)
  res.json(ApiResponse.ok(data))
}

exports.updateUnaffiliated = async (req, res) => {
  const data = await service.updateUnaffiliated(req.params.id, req.body)
  res.json(ApiResponse.ok(data))
}

exports.resetPasswordUnaffiliated = async (req, res) => {
  await service.resetPassword(req.params.id, req.body.newPassword)
  res.json(ApiResponse.ok())
}
