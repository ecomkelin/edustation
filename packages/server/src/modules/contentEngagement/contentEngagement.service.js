'use strict'

const mongoose = require('mongoose')
const ContentEngagement = require('@models/ContentEngagement.model')
const ApiError = require('@utils/ApiError')
const { withCache } = require('@modules/report/reportCache')
const { resolveRange } = require('@modules/report/report.shared')

/**
 * 科普内容用户参与度分析 (2026-07-04 立项)
 *
 * 三个端点:
 *   1. adminKpi      — 机构级 KPI 卡 (top bar 用)
 *   2. adminRowStats — 每行 stats map (admin list 注入 _stats)
 *   3. record        — DRY 写入 helper (bumpXxx 调, 失败不抛)
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
 * 失败仅 warn 不抛业务 (petEvent.service 范式)
 */
async function record({ orgId, contentType, contentId, activeStudentId, sessionMs = 0, source = 'client' }) {
  if (!orgId || !contentId || !activeStudentId) return null
  ensureValidType(contentType)
  try {
    const doc = await ContentEngagement.create({
      org: orgId,
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
 */
async function adminKpi({ orgId, contentType, range }) {
  ensureValidType(contentType)
  const { start, end } = buildRange(range)
  const key = cacheKeyFor(orgId, contentType, 'kpi', start, end)
  return withCache(key, async () => {
    const match = {
      org: mongoose.Types.ObjectId.createFromHexString(String(orgId)),
      contentType,
      occurredAt: { $gte: start, $lt: end }
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
 */
async function adminRowStats({ orgId, contentType, range }) {
  ensureValidType(contentType)
  const { start, end } = buildRange(range)
  const key = cacheKeyFor(orgId, contentType, 'rowStats', start, end)
  return withCache(key, async () => {
    const match = {
      org: mongoose.Types.ObjectId.createFromHexString(String(orgId)),
      contentType,
      occurredAt: { $gte: start, $lt: end }
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
