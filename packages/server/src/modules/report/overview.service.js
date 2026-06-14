'use strict'

/**
 * 经营总览看板（overview）
 *
 * 一次性返回 12 个核心指标：
 *  - 今日 / 本月 营收（paid orders, sum paidAmount / 元）
 *  - 今日 / 本月 订单数（status=paid）
 *  - 待支付订单数 / 待支付金额（status=pending）
 *  - 本月已退费（status=refunded, sum paidAmount / 元）
 *  - 在读学员数 / 本月新增 / 本月流失
 *  - 活跃课包数 / 总剩余课时 / 7 日内过期
 *  - 待续费提醒数
 *  - 7 日出勤率
 *
 * 注意"今日"和"7 日"与 range 无关：业务上是"今天"和"近 7 天"滚窗
 */

const mongoose = require('mongoose')
const Order = require('@models/Order.model')
const Student = require('@models/Student.model')
const StudentProduct = require('@models/StudentProduct.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const { withCache } = require('./reportCache')
const { OrderStatus, CourseEnrollmentStatus } = require('@shared/enums')
const {
  REPORT_TTL_MS,
  buildRange,
  round2,
  YUAN,
  ATTENDED_STATUSES,
  cacheKey
} = require('./report.shared')

const DAY_MS = 24 * 60 * 60 * 1000

async function overview({ orgId, range, from, to }) {
  return withCache(
    cacheKey('overview', { orgId, range, from, to }),
    () => overviewRaw({ orgId, range, from, to }),
    REPORT_TTL_MS
  )
}

async function overviewRaw({ orgId, range, from, to }) {
  const { now, start, end } = buildRange(range, from, to)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)

  // "今日"窗口：始终是今天 0:00 → 明天 0:00，与 range 无关
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(todayStart.getTime() + DAY_MS)
  // "近 7 天"滚窗：与 range 无关
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS)
  const sevenDaysLater = new Date(now.getTime() + 7 * DAY_MS)

  // ---- 营收与订单（一次 $facet 拿到 4 段：今日 paid / range paid / pending / range refunded）----
  const orderStats = await Order.aggregate([
    { $match: { org: orgObjectId } },
    {
      $facet: {
        todayPaid: [
          { $match: { status: OrderStatus.PAID, paidAt: { $gte: todayStart, $lt: tomorrowStart } } },
          { $group: { _id: null, revenue: { $sum: YUAN }, count: { $sum: 1 } } }
        ],
        rangePaid: [
          { $match: { status: OrderStatus.PAID, paidAt: { $gte: start, $lt: end } } },
          { $group: { _id: null, revenue: { $sum: YUAN }, count: { $sum: 1 } } }
        ],
        pending: [
          { $match: { status: OrderStatus.PENDING } },
          { $group: { _id: null, count: { $sum: 1 }, amount: { $sum: '$actualPrice' } } }
        ],
        rangeRefunded: [
          { $match: { status: OrderStatus.REFUNDED, paidAt: { $gte: start, $lt: end } } },
          { $group: { _id: null, amount: { $sum: YUAN }, count: { $sum: 1 } } }
        ]
      }
    }
  ])
  const o = orderStats[0] || {}
  const revenueToday = o.todayPaid?.[0]?.revenue || 0
  const orderCountToday = o.todayPaid?.[0]?.count || 0
  const revenueRange = o.rangePaid?.[0]?.revenue || 0
  const orderCountRange = o.rangePaid?.[0]?.count || 0
  const pendingOrderCount = o.pending?.[0]?.count || 0
  const pendingAmount = o.pending?.[0]?.amount || 0
  const refundedRange = o.rangeRefunded?.[0]?.amount || 0
  const refundedCountRange = o.rangeRefunded?.[0]?.count || 0

  // ---- 学员统计 ----
  const [activeStudents, newStudentsRange] = await Promise.all([
    Student.countDocuments({ org: orgObjectId, isActive: true }),
    Student.countDocuments({ org: orgObjectId, createdAt: { $gte: start, $lt: end } })
  ])
  // 流失：CourseEnrollment.status in [dropped, withdrew]，且 updatedAt 在 range
  const droppedStudentsRange = await CourseEnrollment.countDocuments({
    org: orgObjectId,
    status: { $in: [CourseEnrollmentStatus.DROPPED, CourseEnrollmentStatus.WITHDREW] },
    updatedAt: { $gte: start, $lt: end }
  })

  // ---- 课包统计 ----
  const spStats = await StudentProduct.aggregate([
    { $match: { org: orgObjectId } },
    {
      $facet: {
        active: [
          { $match: { isActive: true, expireDate: { $gt: now } } },
          { $group: { _id: null, count: { $sum: 1 }, remaining: { $sum: '$remainingLessons' } } }
        ],
        expiring: [
          { $match: { isActive: true, expireDate: { $gt: now, $lte: sevenDaysLater } } },
          { $group: { _id: null, count: { $sum: 1 } } }
        ]
      }
    }
  ])
  const sp = spStats[0] || {}
  const activeStudentProducts = sp.active?.[0]?.count || 0
  const totalRemainingLessons = sp.active?.[0]?.remaining || 0
  const expiringSoon = sp.expiring?.[0]?.count || 0

  // ---- 待续费提醒 ----
  const pendingRenewal = await CourseEnrollment.countDocuments({
    org: orgObjectId,
    status: CourseEnrollmentStatus.ENROLLED,
    studentProduct: null
  })

  // ---- 7 日出勤率（与 range 无关）----
  const attStats = await LessonAttendance.aggregate([
    { $match: { org: orgObjectId, actualEndTime: { $gte: sevenDaysAgo, $lte: now } } },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ])
  let attTotal = 0
  let attAttended = 0
  for (const row of attStats) {
    attTotal += row.count
    if (ATTENDED_STATUSES.includes(row._id)) attAttended += row.count
  }
  const attendanceRate7d = attTotal === 0 ? null : Math.round((attAttended / attTotal) * 1000) / 10

  return {
    // range 窗口（前端可显示"统计区间"）
    range: { start: start.toISOString(), end: end.toISOString() },
    revenue: {
      today: round2(revenueToday),
      // 兼容老字段名 `month`（语义已扩展为 "range-bound"）；range=month 时仍为"本月"
      month: round2(revenueRange)
    },
    orders: {
      todayPaid: orderCountToday,
      monthPaid: orderCountRange, // 同上, 字段名沿用
      pendingCount: pendingOrderCount,
      pendingAmount: round2(pendingAmount)
    },
    refund: {
      monthAmount: round2(refundedRange),
      monthCount: refundedCountRange
    },
    students: {
      active: activeStudents,
      newMonth: newStudentsRange, // 字段名沿用
      droppedMonth: droppedStudentsRange
    },
    studentProducts: {
      activeCount: activeStudentProducts,
      totalRemainingLessons,
      expiringSoon7d: expiringSoon
    },
    pendingRenewal,
    attendance: {
      range: '7d',
      total: attTotal,
      attended: attAttended,
      rate: attendanceRate7d
    },
    generatedAt: now.toISOString()
  }
}

module.exports = overview
