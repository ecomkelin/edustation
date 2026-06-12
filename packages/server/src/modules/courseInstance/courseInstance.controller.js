'use strict'

const s = require('./courseInstance.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.create = async (req, res) => res.status(201).json(ApiResponse.created(await s.create({ orgId: req.orgId, ...req.body })))
exports.update = async (req, res) => res.json(ApiResponse.ok(await s.update(req.params.id, req.orgId, req.body)))
exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.softDelete(req.params.id, req.orgId, req.user.id, req.user.isPlatformAdmin)))
exports.removableCheck = async (req, res) => res.json(ApiResponse.ok(await s.removableCheck(req.params.id, req.orgId)))
exports.setStatus = async (req, res) => res.json(ApiResponse.ok(await s.setStatus(
  req.params.id,
  req.orgId,
  req.body.toStatus,
  req.user.id,
  req.body.reason,
  req.user.isPlatformAdmin
)))
