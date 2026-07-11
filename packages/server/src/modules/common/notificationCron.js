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
 *
 * 暴露:
 *   - tickAll() — 测试 / 手动调用
 *   - _tickTimer — 测试清理
 */

const notificationService = require('@modules/notification/notification.service')

const TICK_INTERVAL_MS = 5 * 60 * 1000 // 5 分钟

const tickTimer = setInterval(async () => {
  try {
    const r = await notificationService.dispatchScheduled()
    if (r.dispatched > 0) {
      // eslint-disable-next-line no-console
      console.log(`[notificationCron] tick: dispatched=${r.dispatched}`)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[notificationCron] tickAll failed: ${e.message}`)
  }
}, TICK_INTERVAL_MS)
tickTimer.unref()

module.exports = {
  tickAll: () => notificationService.dispatchScheduled(),
  _tickTimer: tickTimer
}