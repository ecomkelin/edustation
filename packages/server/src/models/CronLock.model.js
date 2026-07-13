'use strict'

const { Schema, model } = require('mongoose')

/**
 * Cron 分布式锁 (2026-07-13 立项)
 *
 * 用途:
 *   - K8s 横向扩容后, 同一 cron 在多副本都会跑, 有副作用的 (taskCron 发通知 /
 *     notificationCron 派发 / petCron 写 PetEvent) 必须只让一个副本跑
 *   - 用 mongo 互斥, 不用引入额外依赖 (redis/zookeeper)
 *
 * 设计:
 *   - 一个 cron 一行: `_id` = cron name (e.g. 'taskCron')
 *   - `owner`: 抢到锁的进程 pid
 *   - `expiresAt`: TTL, 默认 30s; 抢锁时强制续期, tick 完成提前 release
 *   - 进程崩了不 release: 锁自动过期 (下次 tick 时其他进程会抢到)
 *
 * acquire(name, ttlMs):
 *   - findOneAndUpdate({ _id, $or: [{expiresAt: {$lt: now}}, {expiresAt: null}] })
 *     设 owner=pid + expiresAt=now+ttl
 *   - 返回 true = 抢到, false = 别的进程持有
 *
 * release(name):
 *   - 仅 owner 是自己的 pid 才 deleteOne (防止误删别人的锁)
 *
 * 选型理由:
 *   - 单文档 upsert + findOneAndUpdate 原子操作, 无需额外依赖
 *   - 适合 cron 这种"低频 + 长间隔 + 不在意精确度"的场景 (不需要公平锁)
 */

const CronLockSchema = new Schema({
  _id: { type: String, required: true }, // cron name, e.g. 'taskCron'
  owner: { type: Number, required: true }, // process.pid
  expiresAt: { type: Date, required: true },
  acquiredAt: { type: Date, default: Date.now }
}, {
  collection: 'cron_locks',
  // 不开 timestamps; expiresAt 由应用层控制
  versionKey: false
})

// TTL 索引: 锁过期后 mongo 自动清掉 (兜底, 正常由 acquire 续期)
// 索引 background: true 不阻塞启动
CronLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0, background: true })

module.exports = model('CronLock', CronLockSchema)