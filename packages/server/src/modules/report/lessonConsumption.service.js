'use strict'

/**
 * 课消与课表看板（lessonConsumption）
 *
 * 核心指标：
 *  - range 内已消 / 计划消 / 课消率
 *  - 出勤分布（completed / checked_in / madeup / no_show / leave）
 *  - 课评均分（按老师）+ Top/Bottom 10
 *  - 各开班消课进度（Top 10 活跃开班）
 *  - 老师产能 Top 10（按 range 内已排课时数）
 *
 * 字段名 `monthXxx` 沿用老接口（语义已扩展为 "range-bound"）；range=month 时仍为"本月"
 */

const mongoose = require('mongoose')
const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const { withCache } = require('./reportCache')
const { AttendanceStatus, CourseInstanceStatus } = require('@shared/enums')
const {
  REPORT_TTL_MS,
  buildRange,
  round1,
  round2,
  INSTRUCTED_LESSON_STATUSES,
  cacheKey,
  teacherPipeline
} = require('./report.shared')

const DAY_MS = 24 * 60 * 60 * 1000

async function lessonConsumption({ orgId, range, from, to }) {
  return withCache(
    cacheKey('lessonConsumption', { orgId, range, from, to }),
    () => lessonConsumptionRaw({ orgId, range, from, to }),
    REPORT_TTL_MS
  )
}

async function lessonConsumptionRaw({ orgId, range, from, to }) {
  const { now, start, end } = buildRange(range, from, to)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)

  // ---- 已消 / 计划消 ----
  const [completedAgg, plannedAgg] = await Promise.all([
    LessonAttendance.aggregate([
      {
        $match: {
          org: orgObjectId,
          status: AttendanceStatus.COMPLETED,
          actualEndTime: { $gte: start, $lt: end }
        }
      },
      { $count: 'count' }
    ]),
    LessonSchedule.aggregate([
      {
        $match: {
          org: orgObjectId,
          status: { $in: INSTRUCTED_LESSON_STATUSES },
          plannedStartTime: { $gte: start, $lt: end }
        }
      },
      { $count: 'count' }
    ])
  ])
  const completedLessons = completedAgg[0]?.count || 0
  const plannedLessons = plannedAgg[0]?.count || 0
  const consumptionRate = plannedLessons === 0
    ? null
    : Math.round((completedLessons / plannedLessons) * 1000) / 10

  // ---- 出勤分布 ----
  const distAgg = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: start, $lt: end }
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

  // ---- 课评均分（按老师）----
  // 用 teacherPipeline helper 抽 LessonAttendance → LessonSchedule.teacher 关联
  // extraMatch 把 evaluation.score 过滤提到第一阶段,少一次 lookup 后的过滤
  const evalByTeacher = await LessonAttendance.aggregate([
    ...teacherPipeline({ orgObjectId, start, end, extraMatch: { 'evaluation.score': { $ne: null } } }),
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

  // ---- 各开班消课进度（Top 10 活跃）----
  // 这是"开班维度",不走 teacherPipeline,保持原 $lookup
  const instanceProgress = await LessonAttendance.aggregate([
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: start, $lt: end },
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
      $group: { _id: '$ls.courseInstance', completed: { $sum: 1 } }
    },
    {
      $lookup: {
        from: 'course_instances',
        localField: '_id',
        foreignField: '_id',
        as: 'ci',
        pipeline: [{ $project: { name: 1, schedulePlan: 1, status: 1, courseProduct: 1, maxStudents: 1 } }]
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

  // ---- 老师产能 Top 10 ----
  // 这是"按 teacher 维度在 LessonSchedule 上 $group",不走 teacherPipeline (helper 用于 LessonAttendance)
  const teacherProductivityAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $in: INSTRUCTED_LESSON_STATUSES },
        plannedStartTime: { $gte: start, $lt: end }
      }
    },
    { $group: { _id: '$teacher', lessonCount: { $sum: 1 } } },
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
    range: { start: start.toISOString(), end: end.toISOString() },
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

module.exports = lessonConsumption
