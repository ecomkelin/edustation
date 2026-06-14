'use strict'

/**
 * 老师产能与绩效看板（teacherProductivity）
 *
 * 核心指标（按 range 统计；字段名 `monthXxx` 沿用老接口,语义已扩展为 "range-bound"）：
 *  - 老师列表：周课时数、月课时数、班级数、学生数、日均课时、课评均分、消课完成率
 *  - 整体均值(summary)
 *
 * 老师维度 4 段重复管道全部走 teacherPipeline helper:
 *  - teacherStudentAgg(在 LessonAttendance 上,$lookup lesson_schedules 取 teacher)
 *  - teacherEvalAgg(同上,带 evaluation.score 过滤)
 *  - completionAgg(同上,按 status 分桶)
 *  - teacherLessonAgg 在 LessonSchedule 上直接 $group,不走 helper(无 lessonSchedule 字段可 lookup)
 */

const mongoose = require('mongoose')
const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const { withCache } = require('./reportCache')
const {
  REPORT_TTL_MS,
  buildRange,
  round1,
  round2,
  avg,
  INSTRUCTED_LESSON_STATUSES,
  cacheKey,
  teacherPipeline
} = require('./report.shared')

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

async function teacherProductivity({ orgId, range, from, to }) {
  return withCache(
    cacheKey('teacherProductivity', { orgId, range, from, to }),
    () => teacherProductivityRaw({ orgId, range, from, to }),
    REPORT_TTL_MS
  )
}

async function teacherProductivityRaw({ orgId, range, from, to }) {
  const { now, start, end } = buildRange(range, from, to)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)
  // range 实际天数（ceil 防止 0）
  const daysInRange = Math.max(1, Math.ceil((end - start) / DAY_MS))
  const weekAgo = new Date(now.getTime() - WEEK_MS)

  // ---- 老师 range 内 / 近 7 天 课时数(在 LessonSchedule 上 group,不走 teacherPipeline) ----
  const teacherLessonAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $in: INSTRUCTED_LESSON_STATUSES },
        plannedStartTime: { $gte: start, $lt: end }
      }
    },
    {
      $group: {
        _id: '$teacher',
        rangeLessons: { $sum: 1 },
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

  // ---- 学生数(走 teacherPipeline helper) ----
  const teacherStudentAgg = await LessonAttendance.aggregate([
    ...teacherPipeline({ orgObjectId, start, end }),
    { $group: { _id: '$ls.teacher', students: { $addToSet: '$student' } } },
    { $project: { studentCount: { $size: '$students' } } }
  ])
  const studentCountMap = new Map(teacherStudentAgg.map((s) => [String(s._id), s.studentCount]))

  // ---- 课评均分(走 teacherPipeline helper + extraMatch 提前过滤) ----
  const teacherEvalAgg = await LessonAttendance.aggregate([
    ...teacherPipeline({ orgObjectId, start, end, extraMatch: { 'evaluation.score': { $ne: null } } }),
    { $group: { _id: '$ls.teacher', avgScore: { $avg: '$evaluation.score' }, evalCount: { $sum: 1 } } }
  ])
  const evalMap = new Map(teacherEvalAgg.map((e) => [String(e._id), { avg: round2(e.avgScore), count: e.evalCount }]))

  // ---- 消课完成率:completed / total(走 teacherPipeline helper) ----
  const completionAgg = await LessonAttendance.aggregate([
    ...teacherPipeline({ orgObjectId, start, end }),
    { $group: { _id: { teacher: '$ls.teacher', status: '$status' }, count: { $sum: 1 } } }
  ])
  const completionMap = new Map() // teacherId -> { total, completed }
  for (const row of completionAgg) {
    const tid = String(row._id.teacher)
    if (!completionMap.has(tid)) completionMap.set(tid, { total: 0, completed: 0 })
    const acc = completionMap.get(tid)
    acc.total += row.count
    if (row._id.status === 'completed') acc.completed += row.count
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
        // 字段名沿用 `monthlyLessons`,但语义已扩展为 "range-bound"
        monthlyLessons: t.rangeLessons,
        weeklyLessons: t.weeklyLessons,
        weeklyDensity: round1(t.weeklyLessons / 7),
        monthlyDensity: round1(t.rangeLessons / daysInRange),
        classCount: t.classIds?.length || 0,
        studentCount: studentCountMap.get(tid) || 0,
        evaluationAvg: evalInfo.avg,
        evaluationCount: evalInfo.count,
        completionRate: completion.total === 0 ? null : round1((completion.completed / completion.total) * 100)
      }
    })
    .sort((a, b) => b.monthlyLessons - a.monthlyLessons)

  // ---- 整体均值 ----
  const summary = teachers.length === 0
    ? {
        teacherCount: 0,
        avgMonthlyLessons: 0, // 语义 "range-bound"
        avgWeeklyLessons: 0,
        avgClassCount: 0,
        avgStudentCount: 0,
        avgCompletionRate: null,
        avgEvaluation: null
      }
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
    range: { start: start.toISOString(), end: end.toISOString() },
    summary,
    teachers,
    generatedAt: now.toISOString()
  }
}

module.exports = teacherProductivity
