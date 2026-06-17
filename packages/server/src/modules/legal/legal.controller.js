'use strict'

const s = require('./legal.service')
const ApiResponse = require('@utils/ApiResponse')

/* ───────────── 平台级 (公开) ───────────── */

exports.platformList = async (req, res) => {
  res.json(ApiResponse.ok({ items: s.platformList() }))
}

exports.platformGet = async (req, res) => {
  res.json(ApiResponse.ok(s.platformGet(req.params.key)))
}

/* ───────────── /me/pending /me/consents (鉴权) ───────────── */

exports.myPending = async (req, res) => {
  const items = await s.computePendingConsents({
    userId: req.user.id,
    orgId: req.orgId
  })
  res.json(ApiResponse.ok({ items }))
}

exports.recordMyConsents = async (req, res) => {
  const r = await s.recordConsents({
    userId: req.user.id,
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
    consents: req.body.consents || []
  })
  res.json(ApiResponse.ok(r))
}

exports.myConsents = async (req, res) => {
  const r = await s.myConsents({
    userId: req.user.id,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

/* ───────────── /orgs/:orgId/legal-docs (机构级) ───────────── */

exports.orgList = async (req, res) => {
  const r = await s.orgList({
    orgId: req.params.orgId,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.orgGet = async (req, res) => {
  res.json(ApiResponse.ok(await s.orgGetActive(req.params.orgId, req.params.key)))
}

exports.orgHistory = async (req, res) => {
  res.json(ApiResponse.ok({ items: await s.orgHistory(req.params.orgId, req.params.key) }))
}

exports.orgUpsert = async (req, res) => {
  const created = await s.orgUpsert({
    orgId: req.params.orgId,
    key: req.params.key || req.body.key,
    payload: req.body,
    userId: req.user.id
  })
  res.json(ApiResponse.ok(created))
}

exports.orgDisable = async (req, res) => {
  res.json(ApiResponse.ok(await s.orgDisable({ orgId: req.params.orgId, key: req.params.key })))
}
