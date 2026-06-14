'use strict'

/**
 * 教室与排课利用率看板（roomUtilization）
 *
 * 核心指标：
 *  - 教室占用率（按 room）：range 内已排课分钟数 / 营业时段总分钟数
 *    分母固定 30 天（12h/天 × 30d）— 业务上"按月 30 天"估算;切 range 不会改分母,
 *    UI 上把"教室占用率"标签明确为"按 30 天营业时段估算"
 *  - 每日峰值时段（按小时分桶）— 永远近 30 天,与 range 无关
 *  - 排课冲突:teacher/room 同时段重叠(用 application 内存 O(n²) 检测,
 *    业务上 month 排课量级远低于 10w,可接受)
 *  - 开班满班率:CourseEnrollment.count / CourseInstance.maxStudents
 *
 * 字段名 `monthXxx` 沿用老接口(语义已扩展为 "range-bound")
 */

const mongoose = require('mongoose')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const { withCache } = require('./reportCache')
const { LessonScheduleStatus, CourseEnrollmentStatus } = require('@shared/enums')
const {
  REPORT_TTL_MS,
  buildRange,
  round1,
  cacheKey
} = require('./report.shared')

const DAY_MS = 24 * 60 * 60 * 1000
const MS_PER_MINUTE = 60_000

// 业务营业时段口径:10:00 ~ 22:00 → 12h/天;按 30 天一个月计算
// 后续若需按各机构自定义营业时间,可挪到 Org.settings
const BUSINESS_HOURS_PER_DAY = 12
const DAYS_PER_MONTH = 30
const BUSINESS_MINUTES_PER_MONTH = BUSINESS_HOURS_PER_DAY * 60 * DAYS_PER_MONTH

async function roomUtilization({ orgId, range, from, to }) {
  return withCache(
    cacheKey('roomUtilization', { orgId, range, from, to }),
    () => roomUtilizationRaw({ orgId, range, from, to }),
    REPORT_TTL_MS
  )
}

async function roomUtilizationRaw({ orgId, range, from, to }) {
  const { now, start, end } = buildRange(range, from, to)
  const orgObjectId = new mongoose.Types.ObjectId(orgId)

  // ---- 教室占用率(按 room) ----
  const roomAgg = await LessonSchedule.aggregate([
    {
      $match: {
        org: orgObjectId,
        status: { $nin: [LessonScheduleStatus.CANCELLED] },
        plannedStartTime: { $gte: start, $lt: end }
      }
    },
    {
      $group: {
        _id: '$room',
        lessonCount: { $sum: 1 },
        totalMinutes: {
          $sum: { $divide: [{ $subtract: ['$plannedEndTime', '$plannedStartTime'] }, MS_PER_MINUTE] }
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

  // ---- 每日峰值时段(按小时分桶) — 永远近 30 天 ----
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY_MS)
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

  // ---- 排课冲突(teacher/room 同时段重叠) ----
  const allSchedules = await LessonSchedule.find({
    org: orgObjectId,
    status: { $nin: [LessonScheduleStatus.CANCELLED] },
    plannedStartTime: { $gte: start, $lt: end }
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
  for (const [, list] of byTeacher) {
    list.sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (new Date(list[j].plannedStartTime) >= new Date(list[i].plannedEndTime)) break
        conflicts.push({
          type: 'teacher',
          resourceId: String(list[i].teacher),
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
  for (const [, list] of byRoom) {
    list.sort((a, b) => new Date(a.plannedStartTime) - new Date(b.plannedStartTime))
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (new Date(list[j].plannedStartTime) >= new Date(list[i].plannedEndTime)) break
        conflicts.push({
          type: 'room',
          resourceId: String(list[i].room),
          lessonA: { id: list[i]._id, lessonNo: list[i].lessonNo, start: list[i].plannedStartTime, end: list[i].plannedEndTime },
          lessonB: { id: list[j]._id, lessonNo: list[j].lessonNo, start: list[j].plannedStartTime, end: list[j].plannedEndTime }
        })
      }
    }
  }

  // ---- 开班满班率分布 ----
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
    range: { start: start.toISOString(), end: end.toISOString() },
    roomOccupancy,
    peakHour: { hour: peakHour.hour, label: `${String(peakHour.hour).padStart(2, '0')}:00`, count: peakHour.count, hourly },
    conflicts: {
      total: conflicts.length,
      teacherCount: conflicts.filter((c) => c.type === 'teacher').length,
      roomCount: conflicts.filter((c) => c.type === 'room').length,
      samples: conflicts.slice(0, 20)
    },
    instanceFillRate: {
      total: fillList.length,
      avg: fillList.length === 0 ? null : round1(fillList.reduce((s, x) => s + x.fillRate, 0) / fillList.length),
      list: fillList.slice(0, 20)
    },
    generatedAt: now.toISOString()
  }
}

module.exports = roomUtilization
