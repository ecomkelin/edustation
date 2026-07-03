'use strict'

const s = require('./article.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 2026-07-03 下放 per-org: 公开 GET 读 x-org-id header (无需登录, 走 Service 强制校验)
 * admin CRUD 走 mws.requireOrg 中间件, 挂 req.orgId
 */
function orgIdFromReq(req) {
  return req.orgId || req.headers['x-org-id'] || null
}

/**
 * C 端公开端点
 */
exports.list = async (req, res) => {
  const r = await s.publicList({
    orgId: orgIdFromReq(req),
    category: req.query.category,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.detail = async (req, res) => {
  const r = await s.publicDetail({
    id: req.params.id,
    orgId: orgIdFromReq(req)
  })
  // +1 viewCount (原子更新, 失败不影响详情返回)
  s.bumpViewCount(req.params.id).catch(() => {})
  res.json(ApiResponse.ok(r))
}

/**
 * admin 端 CRUD
 */
exports.adminList = async (req, res) => {
  const r = await s.adminList({
    orgId: req.orgId,
    isPublished: req.query.isPublished,
    category: req.query.category,
    keyword: req.query.keyword,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.create = async (req, res) => {
  const r = await s.create({
    orgId: req.orgId,
    payload: req.body,
    userId: req.user.id
  })
  res.status(201).json(ApiResponse.created(r))
}

exports.update = async (req, res) => {
  const r = await s.update({
    id: req.params.id,
    orgId: req.orgId,
    payload: req.body,
    userId: req.user.id
  })
  res.json(ApiResponse.ok(r))
}

exports.remove = async (req, res) => {
  const r = await s.softRemove({
    id: req.params.id,
    orgId: req.orgId,
    userId: req.user.id
  })
  res.json(ApiResponse.ok(r))
}
