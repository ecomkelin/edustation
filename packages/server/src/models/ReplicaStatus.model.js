'use strict'

const { Schema, model } = require('mongoose')

/**
 * 副本状态心跳 (2026-07-13 立项)
 *
 * 用途:
 *   - K8s 多副本部署后, 平台超管需要看"现在有几个 server 进程, 谁还活着"
 *   - /admin/cron/status 端点除了自己进程的 stats, 还展示全局视图
 *
 * 设计:
 *   - 每个进程启动时 upsert 一行, _id = process.pid
 *   - 每 30s 跑一次心跳 (touch lastHeartbeatAt)
 *   - 用 mongo TTL 索引自动清掉 2 分钟没心跳的"僵尸"副本 (崩了/网络断了)
 *
 * 不要混淆:
 *   - ReplicaStatus = "server 进程" 心跳 (每个 server 进程一行)
 *   - CronLock = "cron 任务" 锁 (每个 cron 一行, 谁抢到谁持有)
 */

const ReplicaStatusSchema = new Schema({
  _id: { type: Number, required: true }, // process.pid
  hostname: { type: String, required: true },
  nodeEnv: { type: String, default: 'development' },
  startedAt: { type: Date, default: Date.now },
  lastHeartbeatAt: { type: Date, default: Date.now }
}, {
  collection: 'replica_status',
  versionKey: false
})

// TTL: 2 分钟没心跳 = 进程死了, 自动清掉
// 心跳周期 30s, 2 分钟容错 4 次失败
ReplicaStatusSchema.index({ lastHeartbeatAt: 1 }, { expireAfterSeconds: 120, background: true })

module.exports = model('ReplicaStatus', ReplicaStatusSchema)