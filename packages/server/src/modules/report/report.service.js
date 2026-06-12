'use strict'

/**
 * 数据分析 / 经营看板聚合服务（report.service）
 *
 * 设计原则（2026-06 落定）：
 *  1. 所有指标都基于"现模型 + 现字段"实时聚合，**不**依赖新加字段（CLAUDE.md §16.3 列为"待开发"）。
 *  2. 所有聚合统一按 req.orgId 做多租户隔离；不允许跨机构。
 *  3. 5 个看板对应 5 个公开方法：overview / lessonConsumption / roomUtilization / teacherProductivity / pointsActivity
 *  4. 时间窗口统一通过 resolveRange() 归一化为 { start, end }（Date）；不传时按 'month' 处理。
 *  5. 货币统一以"分"为底（按元展示时除 100 即可）；剩余课时以"节"为单位。
 *  6. 课评均分：本看板把 evaluation.score 视为 1-5 星整数；为空则该考勤不计分。
 */

const mongoose = require('mongoose')
const Order = require('@models/Order.model')
const Student = require('@models/Student.model')
const StudentProduct = require('@models/StudentProduct.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const CourseInstance = require('@models/CourseInstance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const PointsAccount = require('@models/PointsAccount.model')
const PointsTransaction = require('@models/PointsTransaction.model')
const Pet = require('@models/Pet.model')
const {
  OrderStatus,
  CourseEnrollmentStatus,
  CourseInstanceStatus,
  LessonScheduleStatus,
  AttendanceStatus
} = require('@shared/enums')

// =====================================================================
// 公共工具
// =====================================================================

/**
 * 把 range/from/to 解析成 { start, end } Date。
 *  - today:  今天 0:00 → 明天 0:00
 *  - week:   今天 0:00 - 7d → 明天 0:00
 *  - month:  本月 1 号 0:00 → 下月 1 号 0:00（默认）
 *  - custom: from..to（from/to 必填；to 不传则 = now）
 *  - 不识别值：回落到 month
 */
function resolveRange(range, from, to) {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000)

  if (range === 'today') return { start: startOfToday, end: startOfTomorrow }

  if (range === 'week') {
    return { start: new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000), end: startOfTomorrow }
  }

  if (range === 'custom' && from) {
    const s = new Date(from)
    const e = to ? new Date(to) : now
    return { start: s, end: e }
  }

  // month（默认）
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  return { start, end }
}

// 把"元"保留两位小数。聚合管道里直接对 amount 做 $divide: [.., 100] 即可。
const YUAN = { $divide: ['$amount', 100] }

// 业务上"已上过的课"集合：prepared / in_progress / completed / archived
const INSTRUCTED_LESSON_STATUSES = [
  LessonScheduleStatus.PREPARING,
  LessonScheduleStatus.IN_PROGRESS,
  LessonScheduleStatus.COMPLETED,
  LessonScheduleStatus.ARCHIVED
]

// 业务上"未上过的课"集合：仅 scheduled（已排但未进入 preparing）
const PENDING_LESSON_STATUSES = [LessonScheduleStatus.SCHEDULED]

// 考勤"实到"（出勤 = 已消课 + 签到；不包含 leave/no_show）
const ATTENDED_STATUSES = [AttendanceStatus.CHECKED_IN, AttendanceStatus.COMPLETED, AttendanceStatus.MADEUP]

// =====================================================================
// 1. 经营总览（overview）
// =====================================================================

/**
 * 经营总览看板（机构负责人每天看）。
 *
 * 一次性返回 12 个核心指标：
 *  - 今日 / 本月营收（paid orders, sum paidAmount / 元）
 *  - 今日 / 本月新订单数（status=paid, createdAt in range）
 *  - 待支付订单数 / 待支付金额（status=pending）
 *  - 本月已退费（status=refunded, sum paidAmount / 元）
 *  - 在读学员数（Student.isActive=true）
 *  - 本月新增学员（createdAt in month）
 *  - 本月流失学员（CourseEnrollment in [dropped, withdrew], updatedAt in month）
 *  - 活跃课包数（StudentProduct.isActive=true and expireDate>now）
 *  - 总剩余课时（同上，sum remainingLessons）
 *  - 待续费提醒数（CourseEnrollment.status=enrolled and studentProduct=null）
 *  - 7 日内过期课包数（isActive=true and expireDate in [now, now+7d]）
 *  - 7 日出勤率（LessonAttendance: actualEndTime in last 7d, attended/total）
 */
async function overview({ orgId }) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)

  // ---- 营收与订单（一次 $facet 拿到 6 个数） ----
  const orderStats = await Order.aggregate([
    { $match: { org: orgObjectId } },
    {
      $facet: {
        // 今日已付
        todayPaid: [
          { $match: { status: OrderStatus.PAID, paidAt: { $gte: todayStart, $lt: tomorrowStart } } },
          { $group: { _id: null, revenue: { $sum: YUAN }, count: { $sum: 1 } } }
        ],
        // 本月已付
        monthPaid: [
          { $match: { status: OrderStatus.PAID, paidAt: { $gte: monthStart, $lt: nextMonthStart } } },
          { $group: { _id: null, revenue: { $sum: YUAN }, count: { $sum: 1 } } }
        ],
        // 待支付
        pending: [
          { $match: { status: OrderStatus.PENDING } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              amount: { $sum: { $divide: [{ $subtract: ['$actualPrice', '$paidAmount'] }, 100] } }
            }
          }
        ],
        // 本月已退费（status=refunded 视为已退；退款金额近似 paidAmount）
        monthRefunded: [
          { $match: { status: OrderStatus.REFUNDED, paidAt: { $gte: monthStart, $lt: nextMonthStart } } },
          { $group: { _id: null, amount: { $sum: YUAN }, count: { $sum: 1 } } }
        ]
      }
    }
  ])
  const o = orderStats[0] || {}
  const revenueToday = o.todayPaid?.[0]?.revenue || 0
  const orderCountToday = o.todayPaid?.[0]?.count || 0
  const revenueMonth = o.monthPaid?.[0]?.revenue || 0
  const orderCountMonth = o.monthPaid?.[0]?.count || 0
  const pendingOrderCount = o.pending?.[0]?.count || 0
  const pendingAmount = o.pending?.[0]?.amount || 0
  const refundedMonth = o.monthRefunded?.[0]?.amount || 0
  const refundedCountMonth = o.monthRefunded?.[0]?.count || 0

  // ---- 学员统计（active / 本月新增 / 本月流失） ----
  const [activeStudents, newStudentsMonth] = await Promise.all([
    Student.countDocuments({ org: orgObjectId, isActive: true }),
    Student.countDocuments({ org: orgObjectId, createdAt: { $gte: monthStart, $lt: nextMonthStart } })
  ])
  // 流失：CourseEnrollment.status in [dropped, withdrew]，且状态变化时间在本月（updatedAt）
  const droppedStudentsMonth = await CourseEnrollment.countDocuments({
    org: orgObjectId,
    status: { $in: [CourseEnrollmentStatus.DROPPED, CourseEnrollmentStatus.WITHDREW] },
    updatedAt: { $gte: monthStart, $lt: nextMonthStart }
  })

  // ---- 课包统计 ----
  const spStats = await StudentProduct.aggregate([
    { $match: { org: orgObjectId } },
    {
      $facet: {
        // 活跃课包 + 总剩余课时
        active: [
          { $match: { isActive: true, expireDate: { $gt: now } } },
          { $group: { _id: null, count: { $sum: 1 }, remaining: { $sum: '$remainingLessons' } } }
        ],
        // 7 日内过期
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

  // ---- 待续费提醒（enrolled 但无主用课包） ----
  const pendingRenewal = await CourseEnrollment.countDocuments({
    org: orgObjectId,
    status: CourseEnrollmentStatus.ENROLLED,
    studentProduct: null
  })

  // ---- 7 日出勤率 ----
  // 分母：actualEndTime in last 7d 的考勤记录（"已上过"的课，无论结果）
  // 分子：status in [checked_in, completed, madeup]
  const attStats = await LessonAttendance.aggregate([
    { $match: { org: orgObjectId, actualEndTime: { $gte: sevenDaysAgo, $lte: now } } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 }
      }
    }
  ])
  let attTotal = 0
  let attAttended = 0
  for (const row of attStats) {
    attTotal += row.count
    if (ATTENDED_STATUSES.includes(row._id)) attAttended += row.count
  }
  const attendanceRate7d = attTotal === 0 ? null : Math.round((attAttended / attTotal) * 1000) / 10 // 百分比 1 位小数

  return {
    revenue: {
      today: round2(revenueToday),
      month: round2(revenueMonth)
    },
    orders: {
      todayPaid: orderCountToday,
      monthPaid: orderCountMonth,
      pendingCount: pendingOrderCount,
      pendingAmount: round2(pendingAmount)
    },
    refund: {
      monthAmount: round2(refundedMonth),
      monthCount: refundedCountMonth
    },
    students: {
      active: activeStudents,
      newMonth: newStudentsMonth,
      droppedMonth: droppedStudentsMonth
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

// =====================================================================
// 2. 课消与课表（lesson-consumption）
// =====================================================================

/**
 * 课消与课表看板（教务主管每天看）。
 *
 * 核心指标：
 *  - 本月已消 / 计划消 / 课包消耗率
 *  - 出勤分布（completed / checked_in / madeup / no_show / leave / scheduled）
 *  - 课评均分（按老师）+ Top/Bottom 10 老师
 *  - 各开班消课进度（Top 10 活跃开班）
 *  - 老师产能 Top 10（按本月已排课时数）
 */
async function lessonConsumption({ orgId }) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)

  // ---- 已消课 / 计划消课 ----
  // 已消：LessonAttendance.status=completed, actualEndTime in month
  const completedAgg = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: AttendanceStatus.COMPLETED,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    { $count: 'count' }
  ])
  // 计划：LessonSchedule.status in [preparing/in_progress/completed/archived], plannedStartTime in month
  const plannedAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $in: INSTRUCTED_LESSON_STATUSES },
        plannedStartTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    { $count: 'count' }
  ])
  const completedLessons = completedAgg[0]?.count || 0
  const plannedLessons = plannedAgg[0]?.count || 0
  const consumptionRate = plannedLessons === 0 ? null : Math.round((completedLessons / plannedLessons) * 1000) / 10

  // ---- 出勤分布 ----
  // 只统计"已上过"的课对应的考勤（actualEndTime in month）
  const distAgg = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    { $group: { _id: '$status', count: { $sum: 1 } } }
  ])
  const attendanceDistribution = {
    completed: 0,
    checked_in: 0,
    madeup: 0,
    no_show: 0,
    leave: 0
  }
  for (const row of distAgg) {
    if (row._id in attendanceDistribution) attendanceDistribution[row._id] = row.count
  }
  const attTotal = Object.values(attendanceDistribution).reduce((a, b) => a + b, 0)
  const attendanceRates = {
    attendedRate: attTotal === 0 ? null : round1(((attendanceDistribution.completed + attendanceDistribution.checked_in + attendanceDistribution.madeup) / attTotal) * 100),
    noShowRate: attTotal === 0 ? null : round1((attendanceDistribution.no_show / attTotal) * 100),
    leaveRate: attTotal === 0 ? null : round1((attendanceDistribution.leave / attTotal) * 100)
  }

  // ---- 课评均分（按老师） ----
  // 把 evaluation.score 不为空的考勤拉出来，按老师 $group
  const evalAgg = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart },
        'evaluation.score': { $ne: null }
      }
    },
    {
      $group: {
        _id: '$teacher', // LessonAttendance 没有 teacher 字段，需要 $lookup 从 LessonSchedule 取
        avgScore: { $avg: '$evaluation.score' },
        count: { $sum: 1 }
      }
    }
  ])
  // 上面的 teacher 字段不存在，需要修正：用 $lookup 关联 LessonSchedule
  const evalByTeacher = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart },
        'evaluation.score': { $ne: null }
      }
    },
    {
      $lookup: {
        from: 'lesson_schedules',
        localField: 'lessonSchedule',
        foreignField: '_id',
        as: 'ls',
        pipeline: [{ $project: { teacher: 1 } }]
      }
    },
    { $unwind: '$ls' },
    {
      $group: {
        _id: '$ls.teacher',
        avgScore: { $avg: '$evaluation.score' },
        count: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { realName: 1, mobile: 1 } }]
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
  ])
  const evalList = evalByTeacher
    .filter((e) => e._id)
    .map((e) => ({
      teacherId: e._id,
      teacherName: e.user?.realName || '未命名老师',
      avgScore: round2(e.avgScore),
      evaluationCount: e.count
    }))
    .sort((a, b) => b.avgScore - a.avgScore)
  const evaluationTop = evalList.slice(0, 10)
  const evaluationBottom = [...evalList].reverse().slice(0, 10)

  // ---- 各开班消课进度（Top 10 活跃） ----
  // 思路：开班维度聚合"本月已消 / 该开班 totalPlannedLessons"
  const instanceProgress = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart },
        status: AttendanceStatus.COMPLETED
      }
    },
    {
      $lookup: {
        from: 'lesson_schedules',
        localField: 'lessonSchedule',
        foreignField: '_id',
        as: 'ls',
        pipeline: [{ $project: { courseInstance: 1 } }]
      }
    },
    { $unwind: '$ls' },
    {
      $group: {
        _id: '$ls.courseInstance',
        completed: { $sum: 1 }
      }
    },
    {
      $lookup: {
        from: 'course_instances',
        localField: '_id',
        foreignField: '_id',
        as: 'ci',
        pipeline: [
          { $project: { name: 1, schedulePlan: 1, status: 1, courseProduct: 1, maxStudents: 1 } }
        ]
      }
    },
    { $unwind: '$ci' },
    {
      $lookup: {
        from: 'course_products',
        localField: 'ci.courseProduct',
        foreignField: '_id',
        as: 'cp',
        pipeline: [{ $project: { name: 1 } }]
      }
    },
    { $unwind: { path: '$cp', preserveNullAndEmptyArrays: true } }
  ])
  const progressList = instanceProgress
    .map((p) => {
      const total = p.ci?.schedulePlan?.totalPlannedLessons || 0
      return {
        courseInstanceId: p._id,
        courseName: p.cp?.name || '未命名',
        instanceName: p.ci?.name || '',
        status: p.ci?.status,
        completed: p.completed,
        totalPlanned: total,
        progress: total === 0 ? null : round1((p.completed / total) * 100)
      }
    })
    .filter((p) => p.status === CourseInstanceStatus.ACTIVE || p.status === CourseInstanceStatus.CLOSED)
    .sort((a, b) => b.completed - a.completed)
    .slice(0, 10)

  // ---- 老师产能 Top 10（按本月已排课时数） ----
  const teacherProductivityAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $in: INSTRUCTED_LESSON_STATUSES },
        plannedStartTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    {
      $group: {
        _id: '$teacher',
        lessonCount: { $sum: 1 }
      }
    },
    { $sort: { lessonCount: -1 } },
    { $limit: 10 },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { realName: 1, mobile: 1 } }]
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
  ])
  const teacherTop = teacherProductivityAgg.map((t) => ({
    teacherId: t._id,
    teacherName: t.user?.realName || '未命名老师',
    lessonCount: t.lessonCount
  }))

  return {
    range: { start: monthStart.toISOString(), end: nextMonthStart.toISOString() },
    lessons: {
      completed: completedLessons,
      planned: plannedLessons,
      consumptionRate
    },
    attendance: {
      distribution: attendanceDistribution,
      total: attTotal,
      rates: attendanceRates
    },
    instanceProgress: progressList,
    evaluation: {
      top: evaluationTop,
      bottom: evaluationBottom
    },
    teacherTop,
    generatedAt: now.toISOString()
  }
}

// =====================================================================
// 3. 教室与排课利用率（room-utilization）
// =====================================================================

/**
 * 教室与排课利用率看板。
 *
 * 核心指标：
 *  - 教室周占用率（按 room）：本月已排课分钟数 / 营业时段总分钟数（按 10:00-22:00，12h/天，每月 30 天）
 *  - 每日峰值时段（按 plannedStartTime 小时分桶）
 *  - 排课冲突：teacher/room 同时段重叠（用 $lookup 自关联 + plannedStartTime 区间相交）
 *  - 开班满班率：CourseEnrollment.count / CourseInstance.maxStudents
 */
async function roomUtilization({ orgId }) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)
  // 业务营业时段口径：10:00 ~ 22:00 → 12h / 天；按 30 天一个月计算
  // 后续若需要按各机构自定义营业时间，可挪到 Org.settings
  const BUSINESS_HOURS_PER_DAY = 12
  const DAYS_PER_MONTH = 30
  const BUSINESS_MINUTES_PER_MONTH = BUSINESS_HOURS_PER_DAY * 60 * DAYS_PER_MONTH

  // ---- 教室占用率（按 room） ----
  // 思路：LessonSchedule 按 room 聚合 sum(plannedEndTime - plannedStartTime in minutes)
  const roomAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $nin: [LessonScheduleStatus.CANCELLED] },
        plannedStartTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    {
      $group: {
        _id: '$room',
        lessonCount: { $sum: 1 },
        totalMinutes: {
          $sum: { $divide: [{ $subtract: ['$plannedEndTime', '$plannedStartTime'] }, 60_000] }
        }
      }
    },
    {
      $lookup: {
        from: 'rooms',
        localField: '_id',
        foreignField: '_id',
        as: 'room',
        pipeline: [{ $project: { name: 1, capacity: 1, isActive: 1 } }]
      }
    },
    { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } },
    { $sort: { totalMinutes: -1 } }
  ])
  const roomOccupancy = roomAgg
    .filter((r) => r._id) // 过滤掉 room=null 的数据
    .map((r) => ({
      roomId: r._id,
      roomName: r.room?.name || '未命名教室',
      capacity: r.room?.capacity || null,
      isActive: r.room?.isActive !== false,
      lessonCount: r.lessonCount,
      totalMinutes: Math.round(r.totalMinutes),
      occupancyRate: round1((r.totalMinutes / BUSINESS_MINUTES_PER_MONTH) * 100)
    }))

  // ---- 每日峰值时段（按小时分桶） ----
  // 0-23 每一小时排了多少节课（不限定本月，看最近 30 天）
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const peakAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $nin: [LessonScheduleStatus.CANCELLED] },
        plannedStartTime: { $gte: thirtyDaysAgo, $lte: now }
      }
    },
    {
      $group: {
        _id: { $hour: '$plannedStartTime' },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ])
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }))
  for (const row of peakAgg) {
    if (row._id >= 0 && row._id <= 23) hourly[row._id].count = row.count
  }
  const peakHour = hourly.reduce((max, cur) => (cur.count > max.count ? cur : max), { hour: 0, count: 0 })

  // ---- 排课冲突（teacher/room 同时段重叠） ----
  // 取本月内所有非 cancelled 的排课，自关联找相交区间
  // 为了性能，只取"按 teacher 或 room 维度出现 ≥ 2 次的"时段做进一步检查
  const allSchedules = await LessonSchedule.find({
    org: orgObjectId,
    status: { $nin: [LessonScheduleStatus.CANCELLED] },
    plannedStartTime: { $gte: monthStart, $lt: nextMonthStart }
  })
    .select('teacher room plannedStartTime plannedEndTime lessonNo')
    .lean()

  const conflicts = []
  // teacher 冲突
  const byTeacher = new Map()
  for (const ls of allSchedules) {
    if (!ls.teacher) continue
    const k = String(ls.teacher)
    if (!byTeacher.has(k)) byTeacher.set(k, [])
    byTeacher.get(k).push(ls)
  }
  for (const [teacherId, list] of byTeacher) {
    list.sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (new Date(list[j].plannedStartTime) >= new Date(list[i].plannedEndTime)) break
        conflicts.push({
          type: 'teacher',
          resourceId: teacherId,
          lessonA: { id: list[i]._id, lessonNo: list[i].lessonNo, start: list[i].plannedStartTime, end: list[i].plannedEndTime },
          lessonB: { id: list[j]._id, lessonNo: list[j].lessonNo, start: list[j].plannedStartTime, end: list[j].plannedEndTime }
        })
      }
    }
  }
  // room 冲突
  const byRoom = new Map()
  for (const ls of allSchedules) {
    if (!ls.room) continue
    const k = String(ls.room)
    if (!byRoom.has(k)) byRoom.set(k, [])
    byRoom.get(k).push(ls)
  }
  for (const [roomId, list] of byRoom) {
    list.sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (new Date(list[j].plannedStartTime) >= new Date(list[i].plannedEndTime)) break
        conflicts.push({
          type: 'room',
          resourceId: roomId,
          lessonA: { id: list[i]._id, lessonNo: list[i].lessonNo, start: list[i].plannedStartTime, end: list[i].plannedEndTime },
          lessonB: { id: list[j]._id, lessonNo: list[j].lessonNo, start: list[j].plannedStartTime, end: list[j].plannedEndTime }
        })
      }
    }
  }

  // ---- 开班满班率分布 ----
  // 思路：开班维度聚合 enrolled 数，再 join CourseInstance.maxStudents
  const instanceFill = await CourseEnrollment.aggregate([
    { $match: { org: orgObjectId, status: CourseEnrollmentStatus.ENROLLED } },
    { $group: { _id: '$courseInstance', enrolled: { $sum: 1 } } },
    {
      $lookup: {
        from: 'course_instances',
        localField: '_id',
        foreignField: '_id',
        as: 'ci',
        pipeline: [{ $project: { name: 1, status: 1, maxStudents: 1, courseProduct: 1 } }]
      }
    },
    { $unwind: '$ci' },
    {
      $lookup: {
        from: 'course_products',
        localField: 'ci.courseProduct',
        foreignField: '_id',
        as: 'cp',
        pipeline: [{ $project: { name: 1 } }]
      }
    },
    { $unwind: { path: '$cp', preserveNullAndEmptyArrays: true } }
  ])
  const fillList = instanceFill
    .filter((p) => p.ci?.maxStudents)
    .map((p) => ({
      courseInstanceId: p._id,
      courseName: p.cp?.name || '未命名',
      instanceName: p.ci?.name || '',
      status: p.ci?.status,
      enrolled: p.enrolled,
      maxStudents: p.ci.maxStudents,
      fillRate: round1((p.enrolled / p.ci.maxStudents) * 100)
    }))
    .sort((a, b) => b.fillRate - a.fillRate)

  return {
    range: { start: monthStart.toISOString(), end: nextMonthStart.toISOString() },
    roomOccupancy,
    peakHour: { hour: peakHour.hour, label: `${String(peakHour.hour).padStart(2, '0')}:00`, count: peakHour.count, hourly },
    conflicts: {
      total: conflicts.length,
      teacherCount: conflicts.filter((c) => c.type === 'teacher').length,
      roomCount: conflicts.filter((c) => c.type === 'room').length,
      samples: conflicts.slice(0, 20) // 仅展示前 20 条；超出提示用户用排课页查具体冲突
    },
    instanceFillRate: {
      total: fillList.length,
      avg: fillList.length === 0 ? null : round1(fillList.reduce((s, x) => s + x.fillRate, 0) / fillList.length),
      list: fillList.slice(0, 20)
    },
    generatedAt: now.toISOString()
  }
}

// =====================================================================
// 4. 老师产能与绩效（teacher-productivity）
// =====================================================================

/**
 * 老师产能与绩效看板（HR / 教务主管看）。
 *
 * 核心指标（按本月统计）：
 *  - 老师列表：周课时数、月课时数、班级数（distinct courseInstance）、学生数（distinct student）、
 *    课时密度（平均每日课时）、课评均分、消课完成率
 *  - 整体均值
 */
async function teacherProductivity({ orgId }) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)
  const daysInMonth = Math.ceil((nextMonthStart - monthStart) / (24 * 60 * 60 * 1000))
  const daysInWeek = 7

  // ---- 老师本月 / 本周 课时数 ----
  // 直接在 LessonSchedule 上 $group teacher，分桶 status
  const teacherLessonAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $in: INSTRUCTED_LESSON_STATUSES },
        plannedStartTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    {
      $group: {
        _id: '$teacher',
        monthlyLessons: { $sum: 1 },
        weeklyLessons: {
          $sum: { $cond: [{ $gte: ['$plannedStartTime', weekAgo] }, 1, 0] }
        },
        classIds: { $addToSet: '$courseInstance' }
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { realName: 1, mobile: 1 } }]
      }
    },
    { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } }
  ])

  // ---- 学生数（distinct student via LessonAttendance） ----
  const teacherStudentAgg = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    {
      $lookup: {
        from: 'lesson_schedules',
        localField: 'lessonSchedule',
        foreignField: '_id',
        as: 'ls',
        pipeline: [{ $project: { teacher: 1 } }]
      }
    },
    { $unwind: '$ls' },
    {
      $group: {
        _id: '$ls.teacher',
        students: { $addToSet: '$student' }
      }
    },
    {
      $project: {
        studentCount: { $size: '$students' }
      }
    }
  ])
  const studentCountMap = new Map(teacherStudentAgg.map((s) => [String(s._id), s.studentCount]))

  // ---- 课评均分（按老师） ----
  const teacherEvalAgg = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart },
        'evaluation.score': { $ne: null }
      }
    },
    {
      $lookup: {
        from: 'lesson_schedules',
        localField: 'lessonSchedule',
        foreignField: '_id',
        as: 'ls',
        pipeline: [{ $project: { teacher: 1 } }]
      }
    },
    { $unwind: '$ls' },
    {
      $group: {
        _id: '$ls.teacher',
        avgScore: { $avg: '$evaluation.score' },
        evalCount: { $sum: 1 }
      }
    }
  ])
  const evalMap = new Map(teacherEvalAgg.map((e) => [String(e._id), { avg: round2(e.avgScore), count: e.evalCount }]))

  // ---- 消课完成率：completed / (scheduled+preparing+in_progress+completed) ----
  // 按老师维度
  const completionAgg = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: monthStart, $lt: nextMonthStart }
      }
    },
    {
      $lookup: {
        from: 'lesson_schedules',
        localField: 'lessonSchedule',
        foreignField: '_id',
        as: 'ls',
        pipeline: [{ $project: { teacher: 1 } }]
      }
    },
    { $unwind: '$ls' },
    {
      $group: {
        _id: { teacher: '$ls.teacher', status: '$status' },
        count: { $sum: 1 }
      }
    }
  ])
  const completionMap = new Map() // teacherId -> { total, completed }
  for (const row of completionAgg) {
    const tid = String(row._id.teacher)
    if (!completionMap.has(tid)) completionMap.set(tid, { total: 0, completed: 0 })
    const acc = completionMap.get(tid)
    acc.total += row.count
    if (row._id.status === AttendanceStatus.COMPLETED) acc.completed += row.count
  }

  // ---- 汇总 ----
  const teachers = teacherLessonAgg
    .filter((t) => t._id)
    .map((t) => {
      const tid = String(t._id)
      const completion = completionMap.get(tid) || { total: 0, completed: 0 }
      const evalInfo = evalMap.get(tid) || { avg: null, count: 0 }
      return {
        teacherId: t._id,
        teacherName: t.user?.realName || '未命名老师',
        monthlyLessons: t.monthlyLessons,
        weeklyLessons: t.weeklyLessons,
        weeklyDensity: round1(t.weeklyLessons / daysInWeek),
        monthlyDensity: round1(t.monthlyLessons / daysInMonth),
        classCount: t.classIds?.length || 0,
        studentCount: studentCountMap.get(tid) || 0,
        evaluationAvg: evalInfo.avg,
        evaluationCount: evalInfo.count,
        completionRate: completion.total === 0 ? null : round1((completion.completed / completion.total) * 100)
      }
    })
    .sort((a, b) => b.monthlyLessons - a.monthlyLessons)

  // ---- 整体均值（用于顶部摘要） ----
  const summary = teachers.length === 0
    ? { teacherCount: 0, avgMonthlyLessons: 0, avgWeeklyLessons: 0, avgClassCount: 0, avgStudentCount: 0, avgCompletionRate: null, avgEvaluation: null }
    : {
        teacherCount: teachers.length,
        avgMonthlyLessons: round1(teachers.reduce((s, t) => s + t.monthlyLessons, 0) / teachers.length),
        avgWeeklyLessons: round1(teachers.reduce((s, t) => s + t.weeklyLessons, 0) / teachers.length),
        avgClassCount: round1(teachers.reduce((s, t) => s + t.classCount, 0) / teachers.length),
        avgStudentCount: round1(teachers.reduce((s, t) => s + t.studentCount, 0) / teachers.length),
        avgCompletionRate: round1(avg(teachers.map((t) => t.completionRate).filter((v) => v != null))),
        avgEvaluation: round2(avg(teachers.map((t) => t.evaluationAvg).filter((v) => v != null)))
      }

  return {
    range: { start: monthStart.toISOString(), end: nextMonthStart.toISOString() },
    summary,
    teachers,
    generatedAt: now.toISOString()
  }
}

// =====================================================================
// 5. 积分与家长活跃（points-activity）
// =====================================================================

/**
 * 积分与家长活跃看板。
 *
 * 核心指标：
 *  - 积分总览：总入账（amount>0 之和）、总出账（amount<0 之和）、当前总余额
 *  - 积分分布（按 type）
 *  - 活跃家长数（近 7 / 30 天有积分流水的 student 数）
 *  - 宠物等级分布（Pet.level 直方图）
 */
async function pointsActivity({ orgId }) {
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)

  // ---- 积分流水（按 type 分组，按 amount 符号汇总） ----
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

  // ---- 当前总余额（PointsAccount.balance 之和） ----
  const balanceAgg = await PointsAccount.aggregate([
    { $match: { org: orgObjectId } },
    { $group: { _id: null, total: { $sum: '$balance' } } }
  ])
  const totalBalance = balanceAgg[0]?.total || 0

  // ---- 活跃家长数（近 7 / 30 天有积分流水的 student distinct count） ----
  const activeAgg = await PointsTransaction.aggregate([
    { $match: { org: orgObjectId, createdAt: { $gte: thirtyDaysAgo, $lte: now } } },
    {
      $group: {
        _id: {
          $cond: [{ $gte: ['$createdAt', sevenDaysAgo] }, '7d', '30d']
        },
        students: { $addToSet: '$student' }
      }
    },
    {
      $project: {
        range: '$_id',
        count: { $size: '$students' }
      }
    }
  ])
  const activeMap = { '7d': 0, '30d': 0 }
  for (const row of activeAgg) activeMap[row.range] = row.count

  // ---- 宠物等级分布 ----
  const petAgg = await Pet.aggregate([
    { $match: { org: orgObjectId } },
    { $group: { _id: '$level', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ])
  const petLevelDistribution = petAgg.map((p) => ({ level: p._id || 0, count: p.count }))
  const totalPets = petLevelDistribution.reduce((s, p) => s + p.count, 0)

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
      list: petLevelDistribution
    },
    generatedAt: now.toISOString()
  }
}

// =====================================================================
// 工具
// =====================================================================
function round1(v) {
  if (v == null || !Number.isFinite(v)) return null
  return Math.round(v * 10) / 10
}
function round2(v) {
  if (v == null || !Number.isFinite(v)) return null
  return Math.round(v * 100) / 100
}
function avg(arr) {
  if (!arr || arr.length === 0) return null
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

module.exports = {
  resolveRange,
  overview,
  lessonConsumption,
  roomUtilization,
  teacherProductivity,
  pointsActivity
}
