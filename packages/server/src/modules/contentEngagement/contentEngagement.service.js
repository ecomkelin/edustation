'use strict'

const mongoose = require('mongoose')
const ContentEngagement = require('@models/ContentEngagement.model')
const Student = require('@models/Student.model')
const ApiError = require('@utils/ApiError')
const { withCache } = require('@modules/report/reportCache')
const { resolveRange } = require('@modules/report/report.shared')

/**
 * 科普内容用户参与度分析 (2026-07-04 立项, 2026-07-14 改造)
 *
 * 三个端点:
 *   1. adminKpi      — 机构级 KPI 卡 (top bar 用, 按当前 org 过滤)
 *   2. adminRowStats — 每行 stats map (admin list 注入 _stats, 按当前 org 过滤)
 *   3. record        — DRY 写入 helper (bumpXxx 调, 失败不抛)
 *
 * 平台级内容 (Article / Video, 2026-07-14 回退后) 跨机构对所有 C 端家长可见,
 * 但事件流 (engagement) 仍 per-org 隔离: org = 孩子所属机构, 便于机构 admin
 *   拉"自己孩子在本机构看了哪些科普"的统计.
 *   (跨 org 总览 = 平台超管 later, 另接跨 org 聚合端点, 本期不做)
 *   因此 `record` 由 activeStudentId 反查 Student.org 作为分桶 key.
 *
 * 入参 query: ?range=today|week|month|custom&from=ISO&to=ISO (默认 month)
 * 走 60s 进程内缓存 (复用 report.module 基础设施).
 */

const VALID_TYPES = new Set(['article', 'video'])

function ensureValidType(t) {
  if (!VALID_TYPES.has(t)) {
    throw ApiError.badRequest(`contentType 不合法: ${t} (允许: article|video)`)
  }
}

function buildRange(range, from, to) {
  // 复用 report.shared#resolveRange 时间窗逻辑
  return resolveRange(range, from, to)
}

function cacheKeyFor(orgId, contentType, name, f, t) {
  // 第 0 段 = orgId, 匹配 reportCache.withCache split 桶
  return `${orgId}:${contentType}:${name}:${f.toISOString()}:${t.toISOString()}`
}

/**
 * DRY 写入: bumpViewCount / bumpPlayCount 等位置在 +1 doc 计数器后顺手记一条
 * 失败仅 warn 不抛业务 (petEvent.service 范式).
 *
 * 2026-07-14 改造 (内容回退 platform-only):
 *   - 不再接 orgId 入参; 由 activeStudentId 反查 Student.org 作为事件 org
 *   - 适用于 article / video 的 C 端详情 / 播放接口 (公开 / C-auth)
 *   - admin 端不调 (admin 没有 activeStudentId header)
 */
async function record({ contentType, contentId, activeStudentId, sessionMs = 0, source = 'client' }) {
  if (!contentId || !activeStudentId) return null
  ensureValidType(contentType)
  try {
    // 平台级内容事件归孩子所属机构 (per-org 隔离), 便于机构 admin 看自己孩子行为
    const student = await Student.findById(activeStudentId).select('org').lean()
    if (!student || !student.org) return null
    const doc = await ContentEngagement.create({
      org: student.org,
      contentType,
      contentId,
      activeStudent: activeStudentId,
      sessionMs: Math.max(0, Math.floor(sessionMs || 0)),
      source
    })
    return doc.toObject()
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[contentEngagement] write failed:', e.message)
    return null
  }
}

/**
 * KPI 卡聚合: { totalEvents, uniqueStudents, totalMs }
 * 顶部 KpiCard 4 张图共用 1 次查询 ($facet)
 *
 * 2026-07-14 改造 (内容回退 platform-only):
 *   - admin 端点不再 requireOrg, req.orgId 通常是 undefined (平台超管穿透); 普通机构 admin 仍传 req.orgId
 *   - 容忍 orgId 缺失/不合法: 跳过 org filter, 返全平台 KPI (admin 看的就是全平台总览)
 *   - 普通机构 admin 仍按 req.orgId 过滤 (per-org 事件流保持原行为)
 *   - cacheKey: orgId 缺失时用 'platform-all' 占位, 避免缓存 key 冲突
 */
async function adminKpi({ orgId, contentType, range }) {
  ensureValidType(contentType)
  const { start, end } = buildRange(range)
  const key = cacheKeyFor(orgId || 'platform-all', contentType, 'kpi', start, end)
  return withCache(key, async () => {
    const match = {
      contentType,
      occurredAt: { $gte: start, $lt: end }
    }
    // orgId 存在且为合法 ObjectId → 按该 org 过滤 (普通机构 admin 看本机构)
    // orgId 缺失或不合法 → 跨 org 全平台 (平台超管看全平台总览)
    if (orgId && mongoose.isValidObjectId(String(orgId))) {
      match.org = mongoose.Types.ObjectId.createFromHexString(String(orgId))
    }
    const result = await ContentEngagement.aggregate([
      { $match: match },
      {
        $facet: {
          totalEvents: [{ $count: 'n' }],
          uniqueStudents: [{ $group: { _id: '$activeStudent' } }, { $count: 'n' }],
          totalMs: [{ $group: { _id: null, sum: { $sum: '$sessionMs' } } }]
        }
      }
    ])
    const r = result[0] || {}
    return {
      totalEvents: (r.totalEvents && r.totalEvents[0] ? r.totalEvents[0].n : 0) || 0,
      uniqueStudents: (r.uniqueStudents && r.uniqueStudents[0] ? r.uniqueStudents[0].n : 0) || 0,
      totalMs: (r.totalMs && r.totalMs[0] ? r.totalMs[0].sum : 0) || 0,
      range: { start, end }
    }
  })
}

/**
 * Per-row stats: 返回 Map<contentId-string, { totalEvents, uniqueStudents, totalMs }>
 * admin list 注入 _stats 后每个 row 多 3 个字段
 * 2026-07-14 改造: 同 adminKpi 容忍 orgId 缺失
 */
async function adminRowStats({ orgId, contentType, range }) {
  ensureValidType(contentType)
  const { start, end } = buildRange(range)
  const key = cacheKeyFor(orgId || 'platform-all', contentType, 'rowStats', start, end)
  return withCache(key, async () => {
    const match = {
      contentType,
      occurredAt: { $gte: start, $lt: end }
    }
    if (orgId && mongoose.isValidObjectId(String(orgId))) {
      match.org = mongoose.Types.ObjectId.createFromHexString(String(orgId))
    }
    const rows = await ContentEngagement.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$contentId',
          totalEvents: { $sum: 1 },
          uniqueStudents: { $addToSet: '$activeStudent' },
          totalMs: { $sum: '$sessionMs' }
        }
      },
      {
        $project: {
          totalEvents: 1,
          uniqueStudents: { $size: '$uniqueStudents' },
          totalMs: 1
        }
      }
    ])
    const out = {}
    for (const r of rows) {
      out[String(r._id)] = {
        totalEvents: r.totalEvents || 0,
        uniqueStudents: r.uniqueStudents || 0,
        totalMs: r.totalMs || 0
      }
    }
    return out
  })
}

module.exports = {
  record,
  adminKpi,
  adminRowStats
}
