'use strict'

/**
 * 通知归档清理 cron (2026-07-18 立项)
 *
 * 用途:
 *   - 物理删除 archivedAt < now-90d 的 Notification 文档, 释放 MongoDB 空间
 *   - 与 NotificationLog TTL 30d 互补: Log 是审计流水, 30d 必删; Notification 是用户收件箱,
 *     用户主动 archive 后保留 90d (兜底可恢复), 90d 后才能物理删除
 *
 * 设计要点 (与 archiveCron / notificationCron 一致):
 *   - 每 24h tick 一次 (凌晨错峰, 但不依赖具体时间点 — 错过下次自然补)
 *   - leaderElect=true: 多副本部署时只让一个跑, 避免重复 deleteMany
 *   - 单条失败不阻塞; 错误打 warn
 *   - setInterval(...).unref() 不阻塞进程退出
 *
 * 暴露:
 *   - tickAll() — 测试 / 手动调用
 *   - _tickTimer — 测试清理
 *   - setTickFn 注册到 cronRegistry, 供 R-4102 手动 trigger
 */

const Notification = require('@models/Notification.model')
const cronRegistry = require('@modules/common/cronRegistry')
const cronLogger = require('@modules/common/cronLogger')
const cronLock = require('@modules/common/cronLock')

// 归档后保留 90 天 (与 StaffInbox.vue 注释"所有通知默认存留 90 天"对齐)
//   - 太短: 用户后悔 / 误删无救
//   - 太长: 无限增长, 索引膨胀, 列表变慢
const ARCHIVE_TTL_DAYS = 90
const dayMs = (days) => Number(days) * 24 * 60 * 60 * 1000

/**
 * 物理删除 archivedAt < cutoff 且 status=archived 的 Notification
 *   - 必须带 status=archived 双保险, 防 archive() 中途 doc.archivedAt 还没 set 的竞态
 *   - 带 limit 防止一次 tick 删太多阻塞 db (虽然按 90d 阈值一般不会爆量)
 * @returns {Promise<{deleted:number, cutoff:Date}>}
 */
async function purgeArchived(now = new Date()) {
  const cutoff = new Date(now.getTime() - dayMs(ARCHIVE_TTL_DAYS))
  // deleteMany 不支持 sort/limit, 直接删; 90d 阈值下量级可控
  const r = await Notification.deleteMany({
    status: 'archived',
    archivedAt: { $ne: null, $lt: cutoff }
  })
  return { deleted: r.deletedCount || 0, cutoff }
}

async function tickAll() {
  const now = new Date()
  try {
    const { deleted, cutoff } = await purgeArchived(now)
    const stats = { deleted, cutoff: cutoff.toISOString() }
    if (deleted > 0) cronLogger.tick('notificationPurgeCron', stats)
    return stats
  } catch (e) {
    cronLogger.fail('notificationPurgeCron', e, { where: 'purgeArchived' })
    throw e
  }
}

const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24h

// leaderElect: 多副本只让 leader 跑 (deleteMany 幂等但减少无意义 db 流量)
const helper = cronRegistry.register('notificationPurgeCron', TICK_INTERVAL_MS, { leaderElect: true })

const tickTimer = setInterval(async () => {
  if (!(await cronLock.acquire('notificationPurgeCron'))) {
    helper.skip()
    return
  }
  const start = helper.start()
  try {
    const stats = await tickAll()
    helper.finish(null, start, stats)
  } catch (e) {
    helper.finish(e, start)
  } finally {
    await cronLock.release('notificationPurgeCron')
  }
}, TICK_INTERVAL_MS)
tickTimer.unref()
helper.attachTimer(tickTimer)

module.exports = {
  tickAll,
  purgeArchived,
  _tickTimer: tickTimer,
  TTL_DAYS: ARCHIVE_TTL_DAYS
}

// R-4102 手动 trigger 端点用
cronRegistry.setTickFn('notificationPurgeCron', tickAll)
