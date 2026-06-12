'use strict'

const service = require('./position.service')
const ApiResponse = require('@utils/ApiResponse')

exports.permissionsCatalog = async (req, res) => {
  res.json(ApiResponse.ok(service.permissionsCatalog()))
}

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
  await service.remove({ id: req.params.id, orgId: req.orgId })
  res.json(ApiResponse.ok())
}

exports.removableCheck = async (req, res) => {
  const data = await service.removableCheck({ id: req.params.id, orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}

exports.setPermissions = async (req, res) => {
  const data = await service.setPermissions(req.params.id, req.orgId, req.body.permissions)
  res.json(ApiResponse.ok(data))
}

/* ------------------------------------------------------------------
 * 跨机构同步（仅平台超管）
 * ------------------------------------------------------------------ */

exports.listSourceOrgs = async (req, res) => {
  const data = await service.listSourceOrgs({
    keyword: req.query.keyword,
    targetOrgId: req.orgId
  })
  res.json(ApiResponse.ok(data))
}

exports.listByOrg = async (req, res) => {
  const data = await service.listByOrg(req.params.orgId)
  res.json(ApiResponse.ok(data))
}

exports.sync = async (req, res) => {
  const data = await service.syncPositions({
    targetOrgId: req.orgId,
    sourceOrgId: req.body.sourceOrgId,
    positionIds: req.body.positionIds,
    operatorId: req.user.id
  })
  res.json(ApiResponse.ok(data))
}
