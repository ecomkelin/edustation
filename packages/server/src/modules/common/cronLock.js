'use strict'

/**
 * Cron 锁 helper (2026-07-13 立项)
 *
 * 配合 cronRegistry 的 leaderElect 选项使用:
 *
 *   const helper = cronRegistry.register('taskCron', 60_000, { leaderElect: true })
 *   setInterval(async () => {
 *     if (!(await cronLock.acquire('taskCron', 30_000))) return  // 别的进程在跑
 *     try {
 *       await tickAll()
 *     } finally {
 *       await cronLock.release('taskCron')
 *     }
 *   }, 60_000)
 *
 * 设计取舍:
 *   - 用 findOneAndUpdate 原子操作, 不需要 try-catch 包裹
 *   - acquire 时如果锁还在 (没过期), 别的进程持有 → 返回 false, 不刷错误日志
 *     (cron tick 频率低, 偶尔丢一次可接受)
 *   - release 仅在 owner == process.pid 时执行, 防误删别人
 *   - TTL 设 30s 默认: 大多数 cron tick 几秒内完成; 超 30s 说明卡住, 自动让出
 *
 * Mongo 索引: CronLock.expiresAt TTL 自动清 (model 已建)
 */

const CronLock = require('@models/CronLock.model')

const DEFAULT_TTL_MS = 30 * 1000

/**
 * 尝试抢锁
 *
 * @param {string} name
 * @param {number} [ttlMs=30000] 锁过期时间; tick 完成后应主动 release
 * @returns {Promise<boolean>} true=抢到, false=别的进程持有
 */
async function acquire(name, ttlMs = DEFAULT_TTL_MS) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + ttlMs)
  try {
    const r = await CronLock.findOneAndUpdate(
      {
        _id: name,
        $or: [
          { expiresAt: { $lt: now } },   // 已过期
          { expiresAt: { $exists: false } }
        ]
      },
      {
        _id: name,
        owner: process.pid,
        expiresAt,
        acquiredAt: now
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    return r && r.owner === process.pid
  } catch (e) {
    // 重复 _id = 锁被别人持有且未过期 → fail-closed (不跑)
    if (e.code === 11000) {
      return false
    }
    // 其他 mongo 错误 (连接断开等): 不阻塞 cron, 让当前进程跑 (fail-open)
    // eslint-disable-next-line no-console
    console.warn(`[cronLock] acquire(${name}) failed: ${e.message}; allowing tick (fail-open)`)
    return true
  }
}

/**
 * 释放锁 (仅 owner 是自己时)
 *
 * @param {string} name
 * @returns {Promise<boolean>} true=释放成功, false=锁被别人持有或已过期
 */
async function release(name) {
  try {
    const r = await CronLock.deleteOne({ _id: name, owner: process.pid })
    return r.deletedCount > 0
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[cronLock] release(${name}) failed: ${e.message}`)
    return false
  }
}

/**
 * 查看当前持有者 (调试用)
 */
async function peek(name) {
  return CronLock.findById(name).lean()
}

module.exports = { acquire, release, peek, DEFAULT_TTL_MS }