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
  const data = await service.create(req.body)
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  const data = await service.update(req.params.id, req.body)
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
