'use strict'

const s = require('./video.service')
const ApiResponse = require('@utils/ApiResponse')

/**
 * 平台科普视频 (Video) Controller — 2026-07-14 内容回退 platform-only
 *
 * 关键点:
 *   - 平台级 (org=null): 跨机构对所有 C 端家长可见
 *   - 公开端点不需要任何 org 上下文 (x-org-id 透传 header 也被忽略)
 *   - admin CRUD 端点要求 req.user.isPlatformAdmin (routes 中间件 requirePlatformAdmin 把门)
 *   - /videos/:id/play 仍需 authenticate (要拿 activeStudentId 记 engagement)
 */

/**
 * C 端公开端点
 */

// R-3800 英雄位: 返回最新 1 个发布的视频
exports.featured = async (req, res) => {
  const r = await s.publicFeatured()
  res.json(ApiResponse.ok(r))
}

// R-3801 C 端公开列表 (published + 分页)
exports.list = async (req, res) => {
  const r = await s.publicList({
    category: req.query.category,
    page: req.query.page,
    pageSize: req.query.pageSize
  })
  res.json(ApiResponse.ok(r))
}

// R-3802 C 端公开详情 (+1 viewCount)
exports.detail = async (req, res) => {
  const r = await s.publicDetail({
    id: req.params.id
  })
  // 详情时也 bump 一次, 失败不影响返回
  s.bumpViewCount({ id: req.params.id }).catch(() => {})
  res.json(ApiResponse.ok(r))
}

// R-3803 C 端播放/启动计数 (+1, 需鉴权)
// 2026-07-04 改造: 接受 body { durationMs } 上报观看时长; 记 engagement event
// 2026-07-14 改造: 平台级内容, 不再传 orgId; engagement.record 内部反查 kid.org
exports.play = async (req, res) => {
  const r = await s.bumpViewCount({
    id: req.params.id
  })
  // 视频按 activeStudentId 记 1 条 engagement, sessionMs = body.durationMs
  // onShow 进页立即调用 (durationMs=0), onPause/onEnded 真正播放后再调用 1 次 (durationMs=elapsed)
  const durationMs = Math.max(0, parseInt((req.body && req.body.durationMs) || 0, 10)) || 0
  const activeStudentId = (req.headers['x-active-student-id'] || '').trim() || null
  if (activeStudentId && durationMs >= 0) {
    engagement.record({
      contentType: 'video',
      contentId: req.params.id,
      activeStudentId,
      sessionMs: durationMs,
      source: 'client'
    }).catch(() => {})
  }
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

// ─── 2026-07-04 运营分析 (R-3808/3809) ─────────────────────
// 2026-07-14 改造: 仍按 req.orgId (admin 当前机构) 过滤; 内容 platform-only + engagement per-org

const engagement = require('@modules/contentEngagement/contentEngagement.service')

exports.adminStats = async (req, res) => {
  const r = await engagement.adminKpi({
    orgId: req.orgId,
    contentType: 'video',
    range: req.query.range
  })
  res.json(ApiResponse.ok(r))
}

exports.adminRowStats = async (req, res) => {
  const r = await engagement.adminRowStats({
    orgId: req.orgId,
    contentType: 'video',
    range: req.query.range
  })
  res.json(ApiResponse.ok(r))
}
