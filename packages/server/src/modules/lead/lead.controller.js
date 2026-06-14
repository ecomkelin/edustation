'use strict'

const s = require('./lead.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await s.list({
    orgId: req.orgId,
    currentUser: req.user,
    ...req.query
  })
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await s.detail(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.create = async (req, res) => {
  const result = await s.create({
    orgId: req.orgId,
    currentUser: req.user,
    body: req.body
  })
  // 软唯一命中: duplicate=true, 返回既有 lead, 状态码 200 (非 201)
  if (result.duplicate) {
    return res.json(ApiResponse.ok({ duplicate: true, lead: result.lead }))
  }
  return res.status(201).json(ApiResponse.created({ duplicate: false, lead: result.lead }))
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

exports.listActivities = async (req, res) => {
  const data = await s.listActivities(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.createActivity = async (req, res) => {
  const data = await s.createActivity(req.params.id, req.orgId, req.user, req.body)
  res.status(201).json(ApiResponse.created(data))
}

exports.unconvert = async (req, res) => {
  const data = await s.unconvert({ id: req.params.id, orgId: req.orgId, currentUser: req.user })
  res.json(ApiResponse.ok(data))
}
