'use strict'

const s = require('./parent.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await s.list({ orgId: req.orgId, currentUser: req.user, ...req.query })
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await s.detail(req.params.id, req.orgId)
  res.json(ApiResponse.ok(data))
}

exports.withChild = async (req, res) => {
  const result = await s.withChild({ orgId: req.orgId, currentUser: req.user, body: req.body })
  if (result.duplicate) {
    return res.json(ApiResponse.ok({ duplicate: true, parent: result.parent }))
  }
  return res.status(201).json(ApiResponse.created({ duplicate: false, parent: result.parent, childLead: result.childLead }))
}

exports.addChild = async (req, res) => {
  const data = await s.addChild({ orgId: req.orgId, currentUser: req.user, id: req.params.id, body: req.body })
  res.status(201).json(ApiResponse.created(data))
}

exports.update = async (req, res) => {
  const data = await s.update(req.params.id, req.orgId, req.body)
  res.json(ApiResponse.ok(data))
}

exports.recompute = async (req, res) => {
  const data = await s.recompute({ id: req.params.id, orgId: req.orgId })
  res.json(ApiResponse.ok(data))
}

exports.addTag = async (req, res) => {
  const data = await s.addTag(req.params.id, req.orgId, req.body.tagId)
  res.json(ApiResponse.ok(data))
}

exports.removeTag = async (req, res) => {
  const data = await s.removeTag(req.params.id, req.orgId, req.params.tagId)
  res.json(ApiResponse.ok(data))
}

exports.listActivities = async (req, res) => {
  const data = await s.listActivities(req.params.id, req.orgId)
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
