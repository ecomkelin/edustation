'use strict'

/**
 * 自动归档 cron (2026-07-08 立项, 阶段 4 启动)
 *
 * 涵盖 CLAUDE.md §8.2 阶段 4「自动归档 cron 计划」:
 *   - Task         : status ∈ {approved, cancelled, expired} && dueAt < now-90d → archived
 *   - StudentWork  : createdAt < now-365d → archived
 *   - LessonAttendance : 关联 LessonSchedule.status='archived' 且实际结束时间 > 90d → archived
 *
 * 运行:
 *   - 每 12h tick 一次 (00:00 / 12:00 附近; 错过后自然补)
 *   - 与 taskCron / petCron 一致: setInterval(...).unref() 不阻塞进程退出
 *   - 单个数据源失败不阻塞其余; 错误打 warn
 *
 * 暴露:
 *   - tickAll() — 测试/手动调用
 *   - _tickTimer — 测试清理
 *
 * 设计取舍 (重要):
 *   - LessonSchedule 用 status='archived' 表达"业务终态", **没有**独立 archived 字段;
 *     因此该 cron 不再二次隐藏 LessonSchedule, 只处理 LessonAttendance 的二次归档
 *   - auto-archive 的 archivedBy 设为 null, 与人工归档 (actor.userId) 区分
 *   - 阈值集中在 THRESHOLDS, 后续可移到 settings 表
 */

const Task = require('@models/Task.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const StudentWork = require('@models/StudentWork.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const cronRegistry = require('./cronRegistry')
const cronLogger = require('./cronLogger')

// 阈值: 与 CLAUDE.md §8.2 阶段 4 一致
const TASK_ARCHIVE_DAYS = 90
const STUDENTWORK_ARCHIVE_DAYS = 365
const ATTENDANCE_ARCHIVE_DAYS = 90  // 跟随 LessonSchedule.actualEndTime

const dayMs = (days) => Number(days) * 24 * 60 * 60 * 1000

/**
 * 1. Task: 终态 + dueAt 超过 90 天 → 归档
 *   - 与 teacher/archive 端点保持一致: archived 标志位 + archivedAt 时间, 不动子表
 */
async function archiveOldTasks(now) {
  const cutoff = new Date(now.getTime() - dayMs(TASK_ARCHIVE_DAYS))
  const r = await Task.updateMany(
    {
      archived: { $ne: true },
      status: { $in: ['approved', 'cancelled', 'expired'] },
      dueAt: { $lt: cutoff }
    },
    {
      $set: {
        archived: true,
        archivedAt: now,
        archivedBy: null  // null = 系统自动归档
      }
    }
  )
  return r.modifiedCount || r.nModified || 0
}

/**
 * 2. StudentWork: 一年前的作品 → 归档
 *   - 作品生命周期短, 1 年后归档即可; 用户主动搜历史仍可看见 (archived=true 通道)
 */
async function archiveOldStudentWorks(now) {
  const cutoff = new Date(now.getTime() - dayMs(STUDENTWORK_ARCHIVE_DAYS))
  const r = await StudentWork.updateMany(
    {
      archived: { $ne: true },
      createdAt: { $lt: cutoff }
    },
    {
      $set: {
        archived: true,
        archivedAt: now,
        archivedBy: null
      }
    }
  )
  return r.modifiedCount || r.nModified || 0
}

/**
 * 3. LessonAttendance: 关联排课的实际结束时间超过 90 天 → 归档
 *   - 必须确认关联的 LessonSchedule 也已经进入终态 (status=archived 或 status=cancelled),
 *     否则正在进行的课 (status=scheduled/in_progress/preparing/completed 但未归档) 的考勤不应被隐藏
 *   - 使用 aggregation pipeline (mongoose 5+ 支持 updateMany pipeline):$lookup → $set 应该归档
 *   - 用 batch 处理 (按 lessonSchedule 关联 schedule 字段)
 */
async function archiveOldAttendances(now) {
  const cutoff = new Date(now.getTime() - dayMs(ATTENDANCE_ARCHIVE_DAYS))
  // 思路: 用 aggregation pipeline 把关联 LessonSchedule.status='archived' 的 attendance
  //   标记为 shouldArchive, 然后 $merge / updateMany (mongoose updateMany pipeline 形式)
  //   - 简化: 直接 updateMany with $lookup-style filter 不行 (updateMany 不支持 $lookup)
  //   - 解决: 先 find 候选 ids, 再 bulkUpdate; 这样是 2 步, 简单可靠
  //
  // 步骤 a: 找出该归档的 attendance._id 集合
  //   attendance.lessonSchedule → LessonSchedule, 条件: status='archived' 且 actualEndTime < cutoff
  const staleSchedules = await LessonSchedule.find(
    {
      status: 'archived',
      actualEndTime: { $lt: cutoff }
    },
    { _id: 1 }
  ).lean()
  if (staleSchedules.length === 0) return 0
  const scheduleIds = staleSchedules.map((s) => s._id)
  // 步骤 b: 批量归档这些 schedule 下的 attendance
  const r = await LessonAttendance.updateMany(
    {
      archived: { $ne: true },
      lessonSchedule: { $in: scheduleIds }
    },
    {
      $set: {
        archived: true,
        archivedAt: now,
        archivedBy: null
      }
    }
  )
  return r.modifiedCount || r.nModified || 0
}

/**
 * 一轮: 跑全部 3 个数据源自动归档
 *
 * @returns {Promise<{task:number,studentWork:number,attendance:number,errors:number}>}
 */
async function tickAll() {
  const now = new Date()
  const stats = { task: 0, studentWork: 0, attendance: 0, errors: 0 }

  for (const [name, fn] of [
    ['task', () => archiveOldTasks(now)],
    ['studentWork', () => archiveOldStudentWorks(now)],
    ['attendance', () => archiveOldAttendances(now)]
  ]) {
    try {
      stats[name] = await fn()
    } catch (e) {
      stats.errors++
      cronLogger.fail('archiveCron', e, { where: name })
    }
  }
  return stats
}

// 每 12h tick 一次 (00:00 / 12:00 附近; 错过后下次自然补, 不会丢)
const TICK_INTERVAL_MS = 12 * 60 * 60 * 1000

// 注册到 cronRegistry (供 /admin/cron/status 端点查)
const helper = cronRegistry.register('archiveCron', TICK_INTERVAL_MS)

const tickTimer = setInterval(async () => {
  const start = helper.start()
  try {
    const stats = await tickAll()
    // 仅当有数据变动或失败时才打日志 (避免空转日志)
    if (stats.task || stats.studentWork || stats.attendance || stats.errors) {
      cronLogger.tick('archiveCron', stats)
    }
    helper.finish(null, start, stats)
  } catch (e) {
    helper.finish(e, start)
    cronLogger.fail('archiveCron', e, { where: 'tickAll' })
  }
}, TICK_INTERVAL_MS)
tickTimer.unref()
helper.attachTimer(tickTimer)

module.exports = {
  tickAll,
  // 暴露每条数据源的 fn 便于测试
  archiveOldTasks,
  archiveOldStudentWorks,
  archiveOldAttendances,
  _tickTimer: tickTimer,
  THRESHOLDS: {
    TASK_ARCHIVE_DAYS,
    STUDENTWORK_ARCHIVE_DAYS,
    ATTENDANCE_ARCHIVE_DAYS
  }
}

// 2026-07-13 R-4102: 手动 trigger 端点用
cronRegistry.setTickFn('archiveCron', () => tickAll())
