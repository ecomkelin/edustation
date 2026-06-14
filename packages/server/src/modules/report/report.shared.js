'use strict'

/**
 * 经营看板公共工具（report.shared）
 *
 *  - 5 个 service 文件的共享逻辑：时间窗 / 数字舍入 / 业务状态常量 / 缓存 key / 老师维度 $lookup
 *  - 单一职责：纯函数 + 常量，不持有任何状态
 *  - 修改前请先看 report.service.js 老实现作对照（已删除）
 */

const {
  LessonScheduleStatus,
  AttendanceStatus
} = require('@shared/enums')

// =====================================================================
// 时间窗
// =====================================================================

/**
 * 把 range/from/to 解析成 { start, end } Date
 *  - today:  今天 0:00 → 明天 0:00
 *  - week:   近 7 天（今天 0:00 - 7d → 明天 0:00）
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
    return {
      start: new Date(startOfToday.getTime() - 7 * 24 * 60 * 60 * 1000),
      end: startOfTomorrow
    }
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

/**
 * 5 个 service 方法开头的 4 行样板折叠：返回 { now, start, end }
 *  - orgObjectId 由调用方自己 new（因为 helper 不该 import mongoose）
 */
function buildRange(range, from, to) {
  const { start, end } = resolveRange(range, from, to)
  return { now: new Date(), start, end }
}

// =====================================================================
// 数字舍入
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

// =====================================================================
// 业务状态常量
// =====================================================================

/** 订单表金额字段:paidAmount / actualPrice —— 数据库里直接存「元」,不需要 /100 */
const YUAN = '$paidAmount'

/** 业务上"已上过"的课集合：preparing / in_progress / completed / archived */
const INSTRUCTED_LESSON_STATUSES = [
  LessonScheduleStatus.PREPARING,
  LessonScheduleStatus.IN_PROGRESS,
  LessonScheduleStatus.COMPLETED,
  LessonScheduleStatus.ARCHIVED
]

/** 业务上"未上过"的课集合：仅 scheduled */
const PENDING_LESSON_STATUSES = [LessonScheduleStatus.SCHEDULED]

/** 考勤"实到"（出勤 = 已消课 + 签到 + 补课；不包含 leave/no_show） */
const ATTENDED_STATUSES = [
  AttendanceStatus.CHECKED_IN,
  AttendanceStatus.COMPLETED,
  AttendanceStatus.MADEUP
]

// =====================================================================
// 缓存
// =====================================================================

const REPORT_TTL_MS = 60_000

/**
 * 缓存 key 工厂：${orgId}:${name}:${range||'month'}:${from||''}:${to||''}
 *  - 第 0 段必须 = orgId，与 reportCache.withCache 的 split 取桶逻辑匹配（否则存到 'overview' 假桶）
 *  - range / from / to 任一变化都会形成新 key（冷查）
 *  - invalidate(orgId) 整桶清，写操作后调用
 */
function cacheKey(name, { orgId, range, from, to }) {
  return `${orgId}:${name}:${range || 'month'}:${from || ''}:${to || ''}`
}

// =====================================================================
// 老师维度 $lookup helper
// =====================================================================

/**
 * 老师维度 4 段重复管道的复用：把 LessonAttendance $match + $lookup lesson_schedules + $unwind 抽出来
 *
 * 用法：
 *   const rows = await LessonAttendance.aggregate([
 *     ...teacherPipeline({ orgObjectId, start, end }),
 *     { $match: { 'evaluation.score': { $ne: null } } },   // 可选 extra 过滤
 *     { $group: { _id: '$ls.teacher', ... } }
 *   ])
 *
 * extraMatch 会被合并进 $match 段（在 actualEndTime 之后），但**不是**必须在第一阶段用
 * —— 把它放 helper 第一阶段能少一次 lookup 后的过滤（性能），代价是 helper 多一个参数
 */
function teacherPipeline({ orgObjectId, start, end, extraMatch = {} }) {
  return [
    {
      $match: {
        org: orgObjectId,
        actualEndTime: { $gte: start, $lt: end },
        ...extraMatch
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
    { $unwind: '$ls' }
  ]
}

module.exports = {
  // 时间窗
  resolveRange,
  buildRange,
  // 数字
  round1,
  round2,
  avg,
  // 业务常量
  YUAN,
  INSTRUCTED_LESSON_STATUSES,
  PENDING_LESSON_STATUSES,
  ATTENDED_STATUSES,
  // 缓存
  REPORT_TTL_MS,
  cacheKey,
  // 老师维度 helper
  teacherPipeline
}
