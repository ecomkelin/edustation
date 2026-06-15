'use strict'

const mongoose = require('mongoose')
const Parent = require('@models/Parent.model')
const ChildLead = require('@models/ChildLead.model')
const TrialBooking = require('@models/TrialBooking.model')
const { withCache } = require('./reportCache')

/**
 * 招生看板 (recruit.service) - 2026-06 新增
 *
 * 2 个端点:
 *   1. recruitPromoter  - 推广人员 ROI (按 Parent.promoteBy 归因)
 *   2. recruitTeacherConversion - 试听老师转化率 (按 TrialBooking.teacher 归因)
 *
 * 阶段 1 完成后, 阶段 2 补:
 *   - recruitParentLifecycle (家长生命周期分布)
 *   - recruitSourceRoi (渠道 ROI)
 *
 * 入参: ?from=ISO&to=ISO (默认本月)
 * 走 60s 进程内缓存, 与其他 report 一致
 */

function rangeOf(query) {
  const now = new Date()
  if (query.from && query.to) {
    return { from: new Date(query.from), to: new Date(query.to) }
  }
  // 默认本月
  const y = now.getFullYear()
  const m = now.getMonth()
  return {
    from: new Date(y, m, 1),
    to: new Date(y, m + 1, 1)
  }
}

/* ─── 1. 推广人员 ROI ─────────────────────────────── */

async function recruitPromoter({ orgId, from, to }) {
  const { from: f, to: t } = rangeOf({ from, to })
  return withCache(`${orgId}:recruit-promoter:${f.toISOString()}:${t.toISOString()}`, async () => {
    // 1) 拉所有 promoteBy (User) 在此时间窗录入的 Parent
    const parents = await Parent.aggregate([
      { $match: { org: mongoose.Types.ObjectId.createFromHexString(String(orgId)), createdAt: { $gte: f, $lt: t } } },
      {
        $group: {
          _id: '$promoteBy',
          parentCount: { $sum: 1 },
          // 收集所有 childLead id (后续 join)
          childLeadIds: { $addToSet: null }
        }
      }
    ])

    // 2) 拿同时间窗下, 这些 parent 的所有 childLead + 转化数
    const promoterStats = await ChildLead.aggregate([
      {
        $lookup: {
          from: 'parents',
          localField: 'parent',
          foreignField: '_id',
          as: 'parentDoc'
        }
      },
      { $unwind: '$parentDoc' },
      {
        $match: {
          'parentDoc.org': mongoose.Types.ObjectId.createFromHexString(String(orgId)),
          'parentDoc.createdAt': { $gte: f, $lt: t }
        }
      },
      {
        $group: {
          _id: '$parentDoc.promoteBy',
          childLeadCount: { $sum: 1 },
          convertedCount: { $sum: { $cond: [{ $eq: ['$status', 'converted'] }, 1, 0] } },
          lostCount: { $sum: { $cond: [{ $eq: ['$status', 'lost'] }, 1, 0] } }
        }
      }
    ])

    // 3) 按 promoteBy 合并 + 派生 conversionRate
    const childMap = new Map(promoterStats.map((s) => [String(s._id), s]))
    const merged = parents.map((p) => {
      const id = String(p._id)
      const child = childMap.get(id) || { childLeadCount: 0, convertedCount: 0, lostCount: 0 }
      return {
        promoteBy: p._id,
        parentCount: p.parentCount,
        childLeadCount: child.childLeadCount,
        convertedCount: child.convertedCount,
        lostCount: child.lostCount,
        conversionRate: child.childLeadCount > 0
          ? Math.round((child.convertedCount / child.childLeadCount) * 1000) / 10
          : 0
      }
    })

    // 4) populate promoteBy 名字
    const User = require('@models/User.model')
    const userIds = merged.map((m) => m.promoteBy).filter(Boolean)
    const users = await User.find({ _id: { $in: userIds } })
      .select('_id mobile realName')
      .lean()
    const userMap = new Map(users.map((u) => [String(u._id), u]))
    const items = merged
      .map((m) => {
        const u = userMap.get(String(m.promoteBy))
        return {
          ...m,
          realName: u?.realName || '(已离职)',
          mobile: u?.mobile || ''
        }
      })
      .sort((a, b) => b.convertedCount - a.convertedCount)
    return { items, range: { from: f, to: t } }
  })
}

/* ─── 2. 试听老师转化率 ─────────────────────────────── */

async function recruitTeacherConversion({ orgId, from, to }) {
  const { from: f, to: t } = rangeOf({ from, to })
  return withCache(`${orgId}:recruit-teacher-conversion:${f.toISOString()}:${t.toISOString()}`, async () => {
    // 1) 按 teacher 聚合 trial_bookings
    //   - 状态: 包含 completed 才算"试听过" (avoid no_show/cancelled 干扰)
    //   - 转化: result.isEnrolled=true
    const teacherStats = await TrialBooking.aggregate([
      {
        $match: {
          org: mongoose.Types.ObjectId.createFromHexString(String(orgId)),
          scheduledAt: { $gte: f, $lt: t },
          teacher: { $ne: null },
          status: { $in: ['scheduled', 'arrived', 'completed', 'no_show'] }
        }
      },
      {
        $group: {
          _id: '$teacher',
          trialCount: { $sum: 1 },
          arrivedCount: { $sum: { $cond: [{ $eq: ['$status', 'arrived'] }, 1, 0] } },
          completedCount: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          enrolledCount: { $sum: { $cond: [{ $eq: ['$result.isEnrolled', true] }, 1, 0] } }
        }
      }
    ])

    // 2) populate teacher 名字
    const User = require('@models/User.model')
    const teacherIds = teacherStats.map((t) => t._id).filter(Boolean)
    const users = await User.find({ _id: { $in: teacherIds } })
      .select('_id mobile realName')
      .lean()
    const userMap = new Map(users.map((u) => [String(u._id), u]))

    const items = teacherStats
      .map((t) => {
        const u = userMap.get(String(t._id))
        return {
          teacher: t._id,
          realName: u?.realName || '(已离职)',
          mobile: u?.mobile || '',
          trialCount: t.trialCount,
          arrivedCount: t.arrivedCount,
          completedCount: t.completedCount,
          enrolledCount: t.enrolledCount,
          // 转化率定义: 已消课且 result.isEnrolled=true / 试听过 (= trialCount)
          conversionRate: t.trialCount > 0
            ? Math.round((t.enrolledCount / t.trialCount) * 1000) / 10
            : 0
        }
      })
      .sort((a, b) => b.conversionRate - a.conversionRate || b.enrolledCount - a.enrolledCount)
    return { items, range: { from: f, to: t } }
  })
}

module.exports = {
  recruitPromoter,
  recruitTeacherConversion
}
