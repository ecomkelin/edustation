'use strict'

const s = require('./courseEnrollment.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.create = async (req, res) => res.status(201).json(ApiResponse.created(await s.create({ orgId: req.orgId, ...req.body })))
exports.update = async (req, res) => res.json(ApiResponse.ok(await s.update(req.params.id, req.orgId, req.body)))
exports.setStatus = async (req, res) => res.json(ApiResponse.ok(await s.setStatus({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.remove({
  id: req.params.id,
  orgId: req.orgId
})))
exports.removableCheck = async (req, res) => res.json(ApiResponse.ok(await s.removableCheck(req.params.id, req.orgId)))
