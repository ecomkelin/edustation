'use strict'

const s = require('./financeReason.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => {
  const data = await s.listReasons(req.orgId, req.query)
  res.json(ApiResponse.ok(data))
}

exports.create = async (req, res) => {
  res.status(201).json(ApiResponse.created(await s.createReason(req.orgId, req.body)))
}

exports.update = async (req, res) => {
  res.json(ApiResponse.ok(await s.updateReason(req.orgId, req.params.id, req.body)))
}

exports.remove = async (req, res) => {
  res.json(ApiResponse.ok(await s.removeReason(req.orgId, req.params.id)))
}

exports.removableCheck = async (req, res) => {
  res.json(ApiResponse.ok(await s.removableCheck(req.orgId, req.params.id)))
}
