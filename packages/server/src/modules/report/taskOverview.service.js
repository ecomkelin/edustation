'use strict'

/**
 * 任务概览看板 (taskOverview) — R-1957 (2026-08-06 P3.2)
 *
 * 核心指标:
 *  - KPI 行: 总任务数 / 未完结 / 已逾期 / 本月完成率
 *  - Top 5 标签任务数 (水平 bar, 走 echarts)
 *  - 标签任务分布表 (tag / total / done / overdue / completion%)
 *
 * 业务上这些指标**与 range 无关** (任务量是累计快照, "逾期" 是当前 dt 的判断):
 *  故 service 入参保留签名 {orgId, range, from, to} 但 raw 不接 range; 缓存 key 也不带 range
 *  与 pointsActivity 行为一致
 */

const mongoose = require('mongoose')
const Task = require('@models/Task.model')
const { withCache } = require('./reportCache')
const { REPORT_TTL_MS, buildRange, cacheKey } = require('./report.shared')

// 终态 (不进 "未完结" 统计): approved / cancelled / expired
const TERMINAL_STATUSES = ['approved', 'cancelled', 'expired']

async function taskOverview({ orgId, range, from, to }) {
  // 缓存 key 不带 range (业务上与 range 无关, 与 pointsActivity 一致)
  return withCache(
    cacheKey('taskOverview', { orgId, range: 'all', from: '', to: '' }),
    () => taskOverviewRaw({ orgId }),
    REPORT_TTL_MS
  )
}

async function taskOverviewRaw({ orgId }) {
  const { now } = buildRange('month') // 取 now 即可
  const orgObjectId = new mongoose.Types.ObjectId(orgId)

  // ---- 三段 facet 并行 (byTag / byStatus / totals) ----
  const [agg] = await Task.aggregate([
    { $match: { org: orgObjectId, archived: { $ne: true } } },
    {
      $facet: {
        // 2026-08-06 P3.2: 按 tag 分组, 限 Top 20
        byTag: [
          { $unwind: { path: '$tags', preserveNullAndEmptyArrays: false } },
          {
            $group: {
              _id: '$tags',
              total: { $sum: 1 },
              done: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $lt: ['$dueAt', now] },
                        { $nin: ['$status', TERMINAL_STATUSES] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              }
            }
          },
          { $sort: { total: -1 } },
          { $limit: 20 }
        ],
        // 按 status 分组
        byStatus: [
          { $group: { _id: '$status', count: { $sum: 1 } } }
        ],
        // 总数 / 未完结 / 已逾期 / 完成率
        totals: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              done: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
              overdue: {
                $sum: {
                  $cond: [
                    {
                      $and: [
                        { $lt: ['$dueAt', now] },
                        { $nin: ['$status', TERMINAL_STATUSES] }
                      ]
                    },
                    1,
                    0
                  ]
                }
              }
            }
          },
          {
            $project: {
              _id: 0,
              count: 1,
              done: 1,
              overdue: 1,
              // 未完结 = total - 终态三件
              open: {
                $subtract: [
                  '$count',
                  {
                    $add: [
                      { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] },
                      { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] },
                      { $cond: [{ $eq: ['$status', 'expired'] }, 1, 0] }
                    ]
                  }
                ]
              }
            }
          }
        ]
      }
    }
  ])

  // 顶 facet 是数组, 取第一个; 空集合兜底
  const byTag = (agg && agg.byTag) || []
  const byStatus = (agg && agg.byStatus) || []
  const totals = (agg && agg.totals && agg.totals[0]) || { count: 0, done: 0, overdue: 0, open: 0 }

  // completionRate: done / count, 0 时返 0 (避免 NaN)
  const completionRate = totals.count > 0 ? +(totals.done / totals.count * 100).toFixed(1) : 0

  return {
    totals: { ...totals, completionRate },
    byTag: byTag.map((t) => ({
      tag: t._id,
      total: t.total,
      done: t.done,
      overdue: t.overdue,
      completionRate: t.total > 0 ? +(t.done / t.total * 100).toFixed(1) : 0
    })),
    byStatus: byStatus.map((s) => ({ status: s._id, count: s.count }))
  }
}

module.exports = {
  taskOverview,
  taskOverviewRaw   // 暴露给测试/脚本
}
