'use strict'

const s = require('./subject.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))
exports.detail = async (req, res) => res.json(ApiResponse.ok(await s.detail(req.params.id, req.orgId)))
exports.create = async (req, res) => res.status(201).json(ApiResponse.created(await s.create({ orgId: req.orgId, ...req.body })))
exports.update = async (req, res) => res.json(ApiResponse.ok(await s.update(req.params.id, req.orgId, req.body)))
exports.remove = async (req, res) => res.json(ApiResponse.ok(await s.remove({ id: req.params.id, orgId: req.orgId })))
exports.removableCheck = async (req, res) => res.json(ApiResponse.ok(await s.removableCheck({ id: req.params.id, orgId: req.orgId })))

/* ------------------------------------------------------------------
 * 跨机构同步（仅平台超管）
 * ------------------------------------------------------------------ */

exports.listSourceOrgs = async (req, res) => {
  const data = await s.listSourceOrgs({
    keyword: req.query.keyword,
    targetOrgId: req.orgId
  })
  res.json(ApiResponse.ok(data))
}

exports.listByOrg = async (req, res) => {
  const data = await s.listByOrg(req.params.orgId)
  res.json(ApiResponse.ok(data))
}

exports.sync = async (req, res) => {
  const data = await s.syncSubjects({
    targetOrgId: req.orgId,
    sourceOrgId: req.body.sourceOrgId,
    subjectIds: req.body.subjectIds,
    operatorId: req.user.id
  })
  res.json(ApiResponse.ok(data))
}
