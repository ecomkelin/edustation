'use strict'

const s = require('./article.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 平台科普文章 (Article) Controller — 2026-07-14 内容回退 platform-only
 *
 * 关键点:
 *   - 平台级 (org=null): 跨机构对所有 C 端家长可见
 *   - 公开端点不需要任何 org 上下文 (x-org-id 透传 header 也被忽略)
 *   - admin CRUD 端点要求 req.user.isPlatformAdmin (routes 中间件 requirePlatformAdmin 把门)
 */

/**
 * C 端公开端点
 */
exports.list = async (req, res) => {
  const r = await s.publicList({
    category: req.query.category,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.detail = async (req, res) => {
  const r = await s.publicDetail({
    id: req.params.id
  })
  // +1 viewCount + 记一条 engagement (失败不影响详情返回)
  s.bumpViewCount({
    id: req.params.id,
    activeStudentId: req.headers['x-active-student-id'] || null
  }).catch(() => {})
  res.json(ApiResponse.ok(r))
}

/**
 * admin 端 CRUD (requirePlatformAdmin 中间件把关)
 */
exports.adminList = async (req, res) => {
  const r = await s.adminList({
    isPublished: req.query.isPublished,
    category: req.query.category,
    keyword: req.query.keyword,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

exports.adminDetail = async (req, res) => {
  const r = await s.adminDetail(req.params.id)
  res.json(ApiResponse.ok(r))
}

exports.create = async (req, res) => {
  const r = await s.create({
    payload: req.body,
    userId: req.user.id
  })
  res.status(201).json(ApiResponse.created(r))
}

exports.update = async (req, res) => {
  const r = await s.update({
    id: req.params.id,
    payload: req.body,
    userId: req.user.id
  })
  res.json(ApiResponse.ok(r))
}

exports.remove = async (req, res) => {
  const r = await s.softRemove({
    id: req.params.id,
    userId: req.user.id
  })
  res.json(ApiResponse.ok(r))
}

// 平台超管专属物理删除 (走 requirePlatformPassword 中间件 + assertUnused 互锁)
exports.purge = async (req, res) => {
  const r = await s.remove(req.params.id)
  res.json(ApiResponse.ok(r))
}

// 删除预检 (DestructiveConfirm precheck 用)
exports.removableCheck = async (req, res) => {
  const r = await s.removableCheck(req.params.id)
  res.json(ApiResponse.ok(r))
}

// ─── 2026-07-04 运营分析 (R-3606/3607) ─────────────────────
// 2026-07-14 改造: adminStats / adminRowStats 仍按 req.orgId (admin 当前机构) 过滤 —
//  内容是平台级, 但 engagement 事件流 per-org; admin 看的就是当前机构孩子的行为统计

const engagement = require('@modules/contentEngagement/contentEngagement.service')

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
