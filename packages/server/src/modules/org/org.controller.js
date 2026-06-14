'use strict'

const service = require('./org.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await service.list(req.query)
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await service.detail(req.params.id)
  res.json(ApiResponse.ok(data))
}

exports.create = async (req, res) => {
  // fileBindOrgId：上传 logo 时用的源 org（req.orgId），用于 fileBind 跨租户校验。
  // 不传会导致"新建机构时绑的 logo"被 fileBind.isOurFile 当作跨租户跳过 → 孤儿。
  const data = await service.create(req.body, { fileBindOrgId: req.orgId })
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  // fileBindOrgId：req.orgId（上传 logo 时用的源 org），用于 fileBind 跨租户校验。
  // 不传会导致"在 X scope 上传、在 Y org 上 PUT"时，fileBind.isOurFile 误判为跨租户 → 孤儿。
  const data = await service.update(req.params.id, req.body, { fileBindOrgId: req.orgId })
  res.json(ApiResponse.ok(data))
}

// 机构不允许物理删除——见 org.routes.js 注释。请使用 toggle-active。

exports.toggleActive = async (req, res) => {
  const data = await service.toggleActive(req.params.id, req.user.id, req.body.password)
  res.json(ApiResponse.ok(data))
}

exports.candidatePrincipals = async (req, res) => {
  const data = await service.candidatePrincipals(req.params.id)
  res.json(ApiResponse.ok(data))
}
