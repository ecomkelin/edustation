'use strict'

/**
 * 积分与家长活跃看板（pointsActivity）
 *
 * 核心指标:
 *  - 积分总览:总入账(amount>0 之和)、总出账(amount<0 之和)、当前总余额
 *  - 积分分布(按 type)
 *  - 活跃家长数(近 7 / 30 天有积分流水的 student distinct count)
 *  - 宠物等级分布
 *
 * 业务上这些指标**与 range 无关**:
 *  - 累计型指标(总入账/总出账/余额)始终是全量
 *  - "近 7/30 天"是永远滚 7/30 天,不会随用户选 range 变
 *  - 宠物等级是当前快照
 *
 * 故 service 入参 {orgId, range, from, to} 保留签名(与其他 4 块统一),
 * 但 raw 函数**不接收** range;缓存 key 也不带 range,行为稳定
 * UI 提示用户"全量累计,与时间窗无关"
 */

const mongoose = require('mongoose')
const PointsAccount = require('@models/PointsAccount.model')
const PointsTransaction = require('@models/PointsTransaction.model')
const Pet = require('@models/PetAccount.model')
const { withCache } = require('./reportCache')
const {
  REPORT_TTL_MS,
  buildRange,
  cacheKey
} = require('./report.shared')

const DAY_MS = 24 * 60 * 60 * 1000

async function pointsActivity({ orgId, range, from, to }) {
  // 缓存 key 不带 range(业务上与 range 无关;单条)
  // 仍然用 cacheKey 工厂保持 key 形态一致
  return withCache(
    cacheKey('pointsActivity', { orgId, range: 'all', from: '', to: '' }),
    () => pointsActivityRaw({ orgId }),
    REPORT_TTL_MS
  )
}

async function pointsActivityRaw({ orgId }) {
  // 入参 range 故意忽略 — 业务上累计指标
  const { now } = buildRange('month') // 拿 now 用,不用 start/end
  const orgObjectId = new mongoose.Types.ObjectId(orgId)
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS)

  // ---- 积分流水(按 type 分组) ----
  const txAgg = await PointsTransaction.aggregate([
    { $match: { org: orgObjectId } },
    {
      $group: {
        _id: '$type',
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 },
        inflow: { $sum: { $cond: [{ $gt: ['$amount', 0] }, '$amount', 0] } },
        outflow: { $sum: { $cond: [{ $lt: ['$amount', 0] }, '$amount', 0] } }
      }
    }
  ])
  const byType = txAgg.map((r) => ({
    type: r._id || 'unknown',
    count: r.count,
    inflow: r.inflow,
    outflow: r.outflow
  }))
  const totalInflow = txAgg.reduce((s, r) => s + (r.inflow || 0), 0)
  const totalOutflow = txAgg.reduce((s, r) => s + (r.outflow || 0), 0)

  // ---- 当前总余额 ----
  const balanceAgg = await PointsAccount.aggregate([
    { $match: { org: orgObjectId } },
    { $group: { _id: null, total: { $sum: '$balance' } } }
  ])
  const totalBalance = balanceAgg[0]?.total || 0

  // ---- 活跃家长数(近 7/30 天) ----
  const activeAgg = await PointsTransaction.aggregate([
    { $match: { org: orgObjectId, createdAt: { $gte: thirtyDaysAgo, $lte: now } } },
    {
      $group: {
        _id: { $cond: [{ $gte: ['$createdAt', sevenDaysAgo] }, '7d', '30d'] },
        students: { $addToSet: '$student' }
      }
    },
    { $project: { range: '$_id', count: { $size: '$students' } } }
  ])
  const activeMap = { '7d': 0, '30d': 0 }
  for (const row of activeAgg) activeMap[row.range] = row.count

  // ---- 宠物分布（2026-06-21 pet-system-v2: 按 state + tier 聚合，旧 stub 的 level-only 维度被替换） ----
  const petAgg = await Pet.aggregate([
    { $match: { org: orgObjectId } },
    {
      $group: {
        _id: { state: '$state', tier: '$tier' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.tier': 1 } }
  ])
  // 按 state 分组（egg / alive / dead），alive 内再按 tier
  const petStateDistribution = {}
  for (const row of petAgg) {
    const s = row._id.state || 'unknown'
    if (!petStateDistribution[s]) petStateDistribution[s] = []
    petStateDistribution[s].push({ tier: row._id.tier || null, count: row.count })
  }
  const totalPets = petAgg.reduce((s, p) => s + p.count, 0)

  return {
    points: {
      totalInflow,
      totalOutflow,
      totalBalance,
      byType
    },
    activeParents: {
      last7d: activeMap['7d'],
      last30d: activeMap['30d']
    },
    petLevelDistribution: {
      total: totalPets,
      byState: petStateDistribution
    },
    generatedAt: now.toISOString()
  }
}

module.exports = pointsActivity
