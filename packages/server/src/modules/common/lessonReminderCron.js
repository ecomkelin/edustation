'use strict'

/**
 * 课程提醒入队 cron (2026-07-11 立项)
 *
 * 解决问题:
 *   - lesson_remind_1h 原本只在 LessonSchedule.create 时入队
 *   - 若后续用户改 plannedStartTime, 老 reminder 仍指向旧时间, 新时间不会被 reminder 覆盖 → 收不到提醒
 *   - 该 bug 覆盖所有"已存在课被改时间"的场景
 *
 * 设计:
 *   - 每 10 分钟 tick 一次 (lesson 是小时级, 10 分钟够用, 不必 5 分钟那么频繁)
 *   - 扫未来 [now, now + 25h] 的 LessonSchedule:
 *       对每个 schedule 的 LessonAttendance,
 *       查 Notification.findOne({ type:'lesson_remind_1h', 'payload.entityId': attendance._id })
 *       没有 → 调 lessonSchedule.service.publishLessonReminder1h (内部 publish 单条 attendance reminder)
 *   - publishLessonReminder1h 内部已经做了 (type, recipient, entityId) 幂等, 不会重复
 *   - 老 reminder 不清理 (entityId 仍指向 attendance, scheduledFor = 老 start - 1h):
 *       - 若已过 cron dispatch 时间窗: 已 dispatch, 不会再触
 *       - 若未过: 但 attendance 没再被改, schedule 的 plannedStartTime 是当前最新, 老 reminder 是历史错误
 *         这里加额外清理: 当 reminder 的 scheduledFor 与 (schedule.plannedStartTime - 1h) 不一致 → 删旧
 *
 * 设计取舍:
 *   - 与现有 4 个 cron 风格统一 (notificationCron / archiveCron / petCron / taskCron), 用 setInterval + unref
 *   - 单条失败不阻塞其余: try/catch 包住每个 schedule
 *   - limit=200/tick 防止一次扫到太多 (跨多机构)
 *
 * 暴露:
 *   - tickEnqueue() — 测试 / 手动调用
 *   - _tickTimer     — 测试清理
 */

const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const Notification = require('@models/Notification.model')

// 25 小时窗口 = 1 小时 reminder + 24 小时余量 (覆盖跨 0 点调整计划)
const LOOKAHEAD_HOURS = 25
// 每 10 分钟 tick (lesson 是小时级业务)
const TICK_INTERVAL_MS = 10 * 60 * 1000

/**
 * 找未来 [now, now + LOOKAHEAD_HOURS] 内未结束/未归档的 LessonSchedule
 * 跨机构扫, 用 org 分组处理
 */
async function tickEnqueue() {
  const now = new Date()
  const horizon = new Date(now.getTime() + LOOKAHEAD_HOURS * 60 * 60 * 1000)

  // 找未来即将开始的 lesson (status scheduled/preparing 都算)
  const schedules = await LessonSchedule.find({
    plannedStartTime: { $gte: now, $lte: horizon },
    status: { $in: ['scheduled', 'preparing'] },
    deletedAt: null
  })
    .select('_id org courseInstance plannedStartTime plannedEndTime room title')
    .lean()

  if (!schedules.length) return { scanned: 0, enqueued: 0, cleaned: 0, skipped: 0 }

  const lessonScheduleService = require('@modules/lessonSchedule/lessonSchedule.service')

  let enqueued = 0
  let cleaned = 0
  let skipped = 0

  for (const sched of schedules) {
    try {
      // 1) 拉当前课次的所有 LessonAttendance
      const attendances = await LessonAttendance.find({
        lessonSchedule: sched._id,
        status: { $ne: 'cancelled' } // 不给已取消的学生推
      })
        .select('_id student')
        .lean()
      if (!attendances.length) continue

      // 2) 查已有的 lesson_remind_1h Notification (按 attendanceId 索引)
      const attendanceIds = attendances.map((a) => a._id)
      const existingNots = await Notification.find({
        org: sched.org,
        type: 'lesson_remind_1h',
        'payload.entityId': { $in: attendanceIds }
      })
        .select('payload.entityId payload.schedulePlannedStart scheduledFor')
        .lean()

      // 3) 期望 scheduledFor = plannedStartTime - 1h
      const expectedScheduledFor = new Date(sched.plannedStartTime.getTime() - 60 * 60 * 1000)
      const existingMap = new Map(
        existingNots.map((n) => [String(n.payload && n.payload.entityId), n])
      )

      // 4) 入队缺失的 + 清理时间不一致的老 reminder
      const toEnqueue = []
      for (const a of attendances) {
        const exist = existingMap.get(String(a._id))
        if (!exist) {
          toEnqueue.push(a)
          continue
        }
        // reminder 存在, 但 scheduledFor 与当前计划不一致 → 老 reminder, 删
        const existSchedFor = exist.scheduledFor ? new Date(exist.scheduledFor).getTime() : 0
        if (Math.abs(existSchedFor - expectedScheduledFor.getTime()) > 60 * 1000) {
          await Notification.deleteOne({ _id: exist._id, status: 'pending' })
          // 仅删 pending 的, 已 dispatch 的入历史 (按 Notification 自己的 archive 策略走)
          cleaned++
          toEnqueue.push(a)
        }
      }

      // 5) 入队 — 但期望发送时间 < now 时跳过 (避免文案"还有 1 小时"与实际剩余时间不符的误导)
      const nowMs = now.getTime()
      if (expectedScheduledFor.getTime() <= nowMs) {
        // 该课的 reminder 已过点, 不入队; 学生没收到提醒是因为太晚改时间, 业务侧已知情
        skipped += toEnqueue.length
        continue
      }
      if (toEnqueue.length) {
        await lessonScheduleService.publishLessonReminder1h(
          sched.org,
          sched.courseInstance,
          sched._id,
          toEnqueue
        )
        enqueued += toEnqueue.length
      }
    } catch (e) {
      // 单课失败不阻塞其他
      // eslint-disable-next-line no-console
      console.warn(`[lessonReminderCron] org=${sched.org} scheduleId=${sched._id} failed: ${e.message}`)
    }
  }

  return { scanned: schedules.length, enqueued, cleaned }
}

const tickTimer = setInterval(async () => {
  try {
    const r = await tickEnqueue()
    if (r.enqueued > 0 || r.cleaned > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[lessonReminderCron] tick: scanned=${r.scanned} enqueued=${r.enqueued} cleaned=${r.cleaned} skipped=${r.skipped || 0}`
      )
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[lessonReminderCron] tickEnqueue failed:', e.message)
  }
}, TICK_INTERVAL_MS)
tickTimer.unref()

module.exports = {
  tickEnqueue,
  _tickTimer: tickTimer
}