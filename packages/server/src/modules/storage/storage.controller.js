'use strict'

const s = require('./storage.service')
const ApiResponse = require('@utils/ApiResponse')

exports.upload = async (req, res) => {
  const scope = req.query.scope || req.body.scope
  if (!scope) return res.status(400).json(ApiResponse.fail('缺少 scope', 400))
  if (!req.file) return res.status(400).json(ApiResponse.fail('缺少 file', 400))
  const result = await s.uploadOne({
    orgId: req.orgId,
    uploaderId: req.user.id,
    scope,
    buffer: req.file.buffer,
    originalName: req.file.originalname,
    mime: req.file.mimetype,
    size: req.file.size
  })
  res.status(result.dedup ? 200 : 201).json(ApiResponse.created(result))
}

exports.uploadMany = async (req, res) => {
  const scope = req.query.scope || req.body.scope
  if (!scope) return res.status(400).json(ApiResponse.fail('缺少 scope', 400))
  if (!req.files || req.files.length === 0) return res.status(400).json(ApiResponse.fail('缺少 files', 400))
  const items = await s.uploadMany({
    orgId: req.orgId,
    uploaderId: req.user.id,
    scope,
    files: req.files
  })
  res.status(201).json(ApiResponse.created({ items }))
}

exports.list = async (req, res) => {
  const data = await s.list({
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin,
    ...req.query
  })
  res.json(ApiResponse.ok(data))
}

exports.detail = async (req, res) => {
  const data = await s.detail({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(data))
}

exports.bind = async (req, res) => {
  const data = await s.bind({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin,
    refs: req.body.refs || []
  })
  res.json(ApiResponse.ok(data))
}

exports.unbind = async (req, res) => {
  const data = await s.unbind({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin,
    refs: req.body.refs || []
  })
  res.json(ApiResponse.ok(data))
}

exports.remove = async (req, res) => {
  const data = await s.remove({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(data))
}

exports.removableCheck = async (req, res) => {
  const data = await s.removableCheck({
    id: req.params.id,
    orgId: req.orgId,
    isPlatformAdmin: req.user.isPlatformAdmin
  })
  res.json(ApiResponse.ok(data))
}
