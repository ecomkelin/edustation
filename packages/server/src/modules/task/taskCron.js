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

const TICK_INTERVAL_MS = 60 * 1000 // 1 分钟

/**
 * 跑一轮 tick: 过期扫描 + 周期任务生成
 *
 * @returns {Promise<{expired: number, generated: number, errors: number}>}
 */
async function tickAll() {
  const stats = { expired: 0, generated: 0, errors: 0 }
  // 1. 过期扫描
  try {
    const r = await taskService.expireOverdue()
    stats.expired = r.modified
  } catch (e) {
    stats.errors++
    // eslint-disable-next-line no-console
    console.warn(`[taskCron] expireOverdue failed: ${e.message}`)
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
    // eslint-disable-next-line no-console
    console.warn(`[taskCron] query templates failed: ${e.message}`)
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
      // eslint-disable-next-line no-console
      console.warn(`[taskCron] generateFromTemplate failed: tpl=${tpl._id} err=${e.message}`)
    }
  }
  return stats
}

// 注册定时任务(require 即启动)
const tickTimer = setInterval(async () => {
  try {
    const stats = await tickAll()
    if (stats.expired > 0 || stats.generated > 0 || stats.errors > 0) {
      // eslint-disable-next-line no-console
      console.log(`[taskCron] tick: expired=${stats.expired} generated=${stats.generated} errors=${stats.errors}`)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[taskCron] tickAll failed: ${e.message}`)
  }
}, TICK_INTERVAL_MS)
tickTimer.unref()

module.exports = {
  tickAll,
  _tickTimer: tickTimer
}