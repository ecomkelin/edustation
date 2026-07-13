'use strict'

/**
 * 副本心跳 (2026-07-13 立项)
 *
 * 启动时 upsert 一行 (process.pid) 到 replica_status, 每 30s touch lastHeartbeatAt.
 * 进程死了 mongo TTL (2min) 自动清掉.
 *
 * 与 cronRegistry 的区别:
 *   - cronRegistry: 进程内, 跟 setInterval 生命周期
 *   - replicaHeartbeat: 跨进程可见, 让 /admin/cron/status 展示全局视图
 */

const ReplicaStatus = require('@models/ReplicaStatus.model')

const HEARTBEAT_INTERVAL_MS = 30 * 1000 // 30s

let heartbeatTimer = null

async function upsertSelf() {
  await ReplicaStatus.findOneAndUpdate(
    { _id: process.pid },
    {
      _id: process.pid,
      hostname: require('os').hostname(),
      nodeEnv: process.env.NODE_ENV || 'development',
      lastHeartbeatAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  )
}

/**
 * 启动心跳 (require 即触发)
 */
function start() {
  upsertSelf().catch((e) => {
    // eslint-disable-next-line no-console
    console.warn(`[replicaHeartbeat] upsertSelf failed: ${e.message}`)
  })
  heartbeatTimer = setInterval(() => {
    upsertSelf().catch((e) => {
      // eslint-disable-next-line no-console
      console.warn(`[replicaHeartbeat] heartbeat failed: ${e.message}`)
    })
  }, HEARTBEAT_INTERVAL_MS)
  heartbeatTimer.unref()
}

function stop() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

/**
 * 列出所有活着的副本 (mongo TTL 自动过滤僵尸)
 */
async function listAll() {
  return ReplicaStatus.find({}).sort({ _id: 1 }).lean()
}

module.exports = { start, stop, upsertSelf, listAll }