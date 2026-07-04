'use strict'

const s = require('./article.service')
const engagement = require('@modules/contentEngagement/contentEngagement.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 2026-07-03 下放 per-org: 公开 GET 读 x-org-id header (无需登录, 走 Service 强制校验)
 * admin CRUD / play (鉴权) 走 mws.requireOrg 中间件, 挂 req.orgId
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
  const orgId = orgIdFromReq(req)
  const r = await s.publicDetail({
    id: req.params.id,
    orgId
  })
  // +1 viewCount + 记一条 engagement (失败不影响详情返回)
  // 文章按 activeStudentId 拍板记 event, 不带 activeStudent 时只 +1 viewCount
  s.bumpViewCount({
    id: req.params.id,
    orgId,
    activeStudentId: req.headers['x-active-student-id'] || null
  }).catch(() => {})
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

// 2026-07-04: 超管专属物理删除 (走 requirePlatformPassword 中间件 + assertUnused 互锁)
exports.purge = async (req, res) => {
  const r = await s.remove(req.params.id, req.orgId)
  res.json(ApiResponse.ok(r))
}

// 2026-07-04: 删除预检 (普通业务岗 article.read 即可调, 用于 DestructiveConfirm precheck prop)
exports.removableCheck = async (req, res) => {
  const r = await s.removableCheck(req.params.id, req.orgId)
  res.json(ApiResponse.ok(r))
}

// ─── 2026-07-04 运营分析 (R-3606/3607) ─────────────────────

exports.adminStats = async (req, res) => {
  const r = await engagement.adminKpi({
    orgId: req.orgId,
    contentType: 'article',
    range: req.query.range
  })
  res.json(ApiResponse.ok(r))
}

exports.adminRowStats = async (req, res) => {
  const r = await engagement.adminRowStats({
    orgId: req.orgId,
    contentType: 'article',
    range: req.query.range
  })
  res.json(ApiResponse.ok(r))
}
