'use strict'

/**
 * Cron 状态查询 + 手动触发端点 (2026-07-13 立项, MM=41)
 *
 * R-4101: GET  /admin/cron/status   — 所有 cron 实时状态 + 全局视图 (replicas + locks)
 * R-4102: POST /admin/cron/:name/tick — 手动 trigger 单个 cron (绕过 leader 锁)
 *
 * 用途:
 *   - 排查 cron 是否在跑 (lastRunAt + secondsSinceLastRun)
 *   - 排查是否报错 (lastError)
 *   - 看每个 cron 的总 tick / 总 error 数 (长期稳定性)
 *   - 看进程 uptime, 多副本场景快速识别"哪台没启动 cron"
 *   - 手动跑一次 (调试: 数据不对时手动 trigger 看输出; 修复: leader 锁卡住时强制跑)
 *
 * 鉴权:
 *   - requirePlatformAdmin (req.user.isPlatformAdmin)
 *   - 该端点只暴露时序 + 错误信息, 不含业务数据
 */

const registry = require('@modules/common/cronRegistry')
const replicaHeartbeat = require('@modules/common/replicaHeartbeat')
const CronLock = require('@models/CronLock.model')

/**
 * GET /admin/cron/status
 * 返回:
 *   - 当前副本自己: pid / bootTime / uptime / nodeEnv
 *   - crons[]: 当前副本的所有 cron stats
 *   - replicas[]: 所有活着的副本 (mongo TTL 自动过滤僵尸)
 *   - cronLocks[]: 当前 cron_locks 持有者 (谁在跑 leader 锁)
 */
exports.status = async (req, res) => {
  const now = new Date()
  const [replicas, cronLocksDocs] = await Promise.all([
    replicaHeartbeat.listAll(),
    CronLock.find({}).lean()
  ])
  const cronLocks = cronLocksDocs.map((d) => ({
    name: d._id,
    owner: d.owner,
    acquiredAt: d.acquiredAt,
    expiresAt: d.expiresAt,
    // 是否自己持有
    isSelf: d.owner === process.pid,
    // 过期多久 (秒); 负数表示已过期
    expiresInSec: Math.floor((d.expiresAt.getTime() - now.getTime()) / 1000)
  }))
  const data = {
    pid: process.pid,
    bootTime: new Date(registry.bootTime()),
    uptimeSec: registry.uptimeSec(),
    nodeEnv: process.env.NODE_ENV || 'development',
    cronCount: registry.listAll().length,
    crons: registry.listAll(),
    replicas: replicas.map((r) => ({
      pid: r._id,
      hostname: r.hostname,
      nodeEnv: r.nodeEnv,
      startedAt: r.startedAt,
      lastHeartbeatAt: r.lastHeartbeatAt,
      // 距上次心跳多少秒; < 30s 算健康
      secondsSinceHeartbeat: Math.floor((now.getTime() - r.lastHeartbeatAt.getTime()) / 1000),
      isSelf: r._id === process.pid
    })),
    cronLocks
  }
  res.json({ success: true, data })
}

/**
 * POST /admin/cron/:name/tick
 *
 * 手动跑一次. 绕过 leader 锁 (admin 显式触发, 总能跑).
 *
 * 进程内互斥 (2026-07-13): 同一进程内同时只允许 1 个手动 tick 跑该 cron,
 *   并发请求返回 409 + conflict 详情 (谁在跑, 跑了多久)
 *   跨副本: 不同进程互不感知 (按设计)
 *
 * body: 可选 { dryRun: true } — 当前未实现, 留 hook 给将来调试用
 */
exports.runTick = async (req, res) => {
  const name = req.params.name
  const triggeredBy = `platformAdmin:${req.user.id}`
  const data = await registry.runManualTick(name, triggeredBy)
  if (!data.ok) {
    if (data.errorCode === 'already_running') {
      // 409: 进程内互斥 — 同 cron 正在被另一个 admin 手动跑
      return res.status(409).json({
        success: false,
        code: 409,
        message: data.error,
        data: {
          conflict: data.conflict  // { startedAt, by, secondsAgo }
        }
      })
    }
    // 404: cron 不存在或没注册 tickFn
    return res.status(404).json({
      success: false,
      code: 404,
      message: data.error,
      data: { durationMs: data.durationMs }
    })
  }
  res.json({
    success: true,
    data: {
      name,
      durationMs: data.durationMs,
      result: data.result,
      triggeredBy
    }
  })
}