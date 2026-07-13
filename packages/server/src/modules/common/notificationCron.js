'use strict'

/**
 * 通知 cron (2026-07-11 v0.9 立项)
 *
 * 用途:
 *   - 每 5 分钟 tick 一次 (高灵敏: 课程提醒是分钟级业务)
 *   - 扫 scheduledFor ≤ now 且 channels 仍有 pending 的 Notification 文档 → 调 dispatch
 *   - 与 archiveCron / petCron / taskCron 一致: setInterval(...).unref() 不阻塞进程退出
 *
 * 设计取舍:
 *   - 不依赖任何外部调度器 (node-cron / agenda 等), 与现有 3 个 cron 风格统一
 *   - 单条失败不阻塞其余: 每条 dispatch 包在 try/catch
 *   - limit=100/tick 防止一次扫到太多 (例如 server 重启后积压)
 *   - 2026-07-13: leaderElect=true — dispatch 会发微信/短信, 多副本必须只让一个跑
 *
 * 暴露:
 *   - tickAll() — 测试 / 手动调用
 *   - _tickTimer — 测试清理
 */

const notificationService = require('@modules/notification/notification.service')
const cronRegistry = require('@modules/common/cronRegistry')
const cronLogger = require('@modules/common/cronLogger')
const cronLock = require('@modules/common/cronLock')

const TICK_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟

const helper = cronRegistry.register('notificationCron', TICK_INTERVAL_MS, { leaderElect: true })

const tickTimer = setInterval(async () => {
  if (!(await cronLock.acquire('notificationCron'))) {
    helper.skip()
    return
  }
  const start = helper.start()
  try {
    const r = await notificationService.dispatchScheduled()
    if (r.dispatched > 0) {
      cronLogger.tick('notificationCron', r)
    }
    helper.finish(null, start, r)
  } catch (e) {
    helper.finish(e, start)
    cronLogger.fail('notificationCron', e, { where: 'dispatchScheduled' })
  } finally {
    await cronLock.release('notificationCron')
  }
}, TICK_INTERVAL_MS)
tickTimer.unref()
helper.attachTimer(tickTimer)

module.exports = {
  tickAll: () => notificationService.dispatchScheduled(),
  _tickTimer: tickTimer
}

// 2026-07-13 R-4102: 手动 trigger 端点用
cronRegistry.setTickFn('notificationCron', () => notificationService.dispatchScheduled())