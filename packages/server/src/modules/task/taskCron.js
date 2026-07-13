'use strict'

/**
 * 任务 cron (2026-07-08 立项, MM=39)
 *
 * 行为:
 *   - 每 60s tick 一次
 *   - 1) 调 taskService.expireOverdue() 把 dueAt < now 且非终态的任务标 expired
 *   - 2) 找 TaskTemplate { isActive: true, nextRunAt: { $lte: now } }, 对每个调 generateFromTemplate
 *
 * 设计:
 *   - 与 petCron 一致: setInterval(...).unref() 不阻塞进程退出
 *   - 单次 tick 失败不抛: try/catch 兜底 + console.warn
 *   - 暴露 tickAll() 给测试/手动触发
 *
 * K8s 丢 tick 风险:
 *   - generateFromTemplate 是按 nextRunAt 触发, 不会丢(下次 tick 自然补)
 *   - expireOverdue 用 `dueAt < now` 兜底, 不会漏
 */

const TaskTemplate = require('@models/TaskTemplate.model')
const taskService = require('./task.service')
const cronRegistry = require('@modules/common/cronRegistry')
const cronLogger = require('@modules/common/cronLogger')
const cronLock = require('@modules/common/cronLock')

const TICK_INTERVAL_MS = 60 * 1000 // 1 分钟

/**
 * 跑一轮 tick: 过期扫描 + 周期任务生成
 *
 * @returns {Promise<{expired: number, generated: number, errors: number}>}
 */
async function tickAll() {
  const stats = { expired: 0, generated: 0, notified: 0, errors: 0 }
  // 1. 过期扫描
  try {
    const r = await taskService.expireOverdue()
    stats.expired = r.modified
  } catch (e) {
    stats.errors++
    cronLogger.fail('taskCron', e, { where: 'expireOverdue' })
  }
  // 1.5 (2026-07-11 v0.9 通知): 今天到期的任务给 assignee+supervisor+creator 发 task_due 通知
  try {
    const r = await taskService.notifyDueToday()
    stats.notified = r.notified
    stats.errors += r.errors
  } catch (e) {
    stats.errors++
    cronLogger.fail('taskCron', e, { where: 'notifyDueToday' })
  }
  // 2. 周期任务生成
  const now = new Date()
  let templates
  try {
    templates = await TaskTemplate.find({
      isActive: true,
      nextRunAt: { $lte: now }
    }).limit(100).lean()
  } catch (e) {
    cronLogger.fail('taskCron', e, { where: 'queryTemplates' })
    return stats
  }
  for (const tpl of templates) {
    try {
      const tplDoc = await TaskTemplate.findById(tpl._id)
      if (!tplDoc) continue
      await taskService.generateFromTemplate(tplDoc, null, false)
      stats.generated++
    } catch (e) {
      stats.errors++
      cronLogger.fail('taskCron', e, { where: `generate:${tpl._id}` })
    }
  }
  return stats
}

// 注册定时任务(require 即启动)
// 2026-07-13: leaderElect=true — taskCron 发 task_due 通知 + 生成 Task, 多副本会重复副作用
const helper = cronRegistry.register('taskCron', TICK_INTERVAL_MS, { leaderElect: true })

const tickTimer = setInterval(async () => {
  // 多副本场景: 抢不到锁就跳过 (其他副本在跑)
  if (!(await cronLock.acquire('taskCron'))) {
    helper.skip()
    return
  }
  const start = helper.start()
  try {
    const stats = await tickAll()
    if (stats.expired > 0 || stats.generated > 0 || stats.notified > 0 || stats.errors > 0) {
      cronLogger.tick('taskCron', stats)
    }
    helper.finish(null, start, stats)
  } catch (e) {
    helper.finish(e, start)
    cronLogger.fail('taskCron', e, { where: 'tickAll' })
  } finally {
    await cronLock.release('taskCron')
  }
}, TICK_INTERVAL_MS)
tickTimer.unref()
helper.attachTimer(tickTimer)

module.exports = {
  tickAll,
  _tickTimer: tickTimer
}

// 2026-07-13 R-4102: 手动 trigger 端点用
cronRegistry.setTickFn('taskCron', () => tickAll())