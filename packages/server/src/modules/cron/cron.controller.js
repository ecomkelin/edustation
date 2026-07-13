'use strict'

/**
 * Cron 状态查询 + 手动触发 + 流水查询端点 (2026-07-13 立项, MM=41)
 *
 * R-4101: GET  /admin/cron/status   — 所有 cron 实时状态 + 全局视图 (replicas + locks)
 * R-4102: POST /admin/cron/:name/tick — 手动 trigger 单个 cron (绕过 leader 锁)
 * R-4103: GET  /admin/cron/ticks  — 查 cron_tick_logs 流水 (历史 tick 记录, 30 天 TTL)
 *
 * 用途:
 *   - 排查 cron 是否在跑 (lastRunAt + secondsSinceLastRun)
 *   - 排查是否报错 (lastError)
 *   - 看每个 cron 的总 tick / 总 error 数 (长期稳定性)
 *   - 看进程 uptime, 多副本场景快速识别"哪台没启动 cron"
 *   - 手动跑一次 (调试: 数据不对时手动 trigger 看输出; 修复: leader 锁卡住时强制跑)
 *   - 流水查历史 (R-4103): "昨天 14:00 任务提醒为什么没发" 这类问题
 *
 * 鉴权:
 *   - requirePlatformAdmin (req.user.isPlatformAdmin)
 *   - 该端点只暴露时序 + 错误信息, 不含业务数据
 */

const registry = require('@modules/common/cronRegistry')
const replicaHeartbeat = require('@modules/common/replicaHeartbeat')
const CronLock = require('@models/CronLock.model')
const CronTickLog = require('@models/CronTickLog.model')

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

/**
 * GET /admin/cron/ticks
 *
 * 查 cron_tick_logs 流水 (2026-07-13 续, R-4103)
 *
 * Query (全部 optional):
 *   - name:       cron 名过滤 (e.g. 'taskCron')
 *   - source:     'auto' | 'manual' | 'skip'
 *   - ok:         'true' | 'false' (失败/成功筛选)
 *   - pid:        进程 PID (多副本场景, 看哪台跑了)
 *   - from:       ISO 字符串 (startedAt ≥ from)
 *   - to:         ISO 字符串 (startedAt ≤ to)
 *   - page:       1-based, 默认 1
 *   - pageSize:   默认 20, max 100
 *
 * 响应:
 *   { data: { items: [...], total, page, pageSize, filter } }
 *
 * 排障用例:
 *   - "昨天 14:00 任务提醒为什么没发" → ?name=taskCron&ok=false&from=2026-07-12T13:00:00Z&to=2026-07-12T15:00:00Z
 *   - "多副本场景 taskCron 跑了多少次" → ?name=taskCron&from=...
 *   - "谁手动 trigger 了" → ?source=manual
 */
exports.listTicks = async (req, res) => {
  const filter = {}

  if (req.query.name) {
    filter.name = String(req.query.name)
  }
  if (req.query.source) {
    const s = String(req.query.source)
    if (!['auto', 'manual', 'skip'].includes(s)) {
      return res.status(400).json({ success: false, message: 'source must be auto|manual|skip' })
    }
    filter.source = s
  }
  if (req.query.ok != null && req.query.ok !== '') {
    if (req.query.ok === 'true') filter.ok = true
    else if (req.query.ok === 'false') filter.ok = false
    else return res.status(400).json({ success: false, message: 'ok must be true|false' })
  }
  if (req.query.pid) {
    const p = Number(req.query.pid)
    if (!Number.isInteger(p) || p <= 0) {
      return res.status(400).json({ success: false, message: 'pid must be a positive integer' })
    }
    filter.pid = p
  }
  if (req.query.from || req.query.to) {
    filter.startedAt = {}
    if (req.query.from) {
      const d = new Date(req.query.from)
      if (isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: 'from must be a valid ISO date' })
      }
      filter.startedAt.$gte = d
    }
    if (req.query.to) {
      const d = new Date(req.query.to)
      if (isNaN(d.getTime())) {
        return res.status(400).json({ success: false, message: 'to must be a valid ISO date' })
      }
      filter.startedAt.$lte = d
    }
  }

  // 分页
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20))
  const skip = (page - 1) * pageSize

  const [items, total] = await Promise.all([
    CronTickLog.find(filter)
      .sort({ startedAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean(),
    CronTickLog.countDocuments(filter)
  ])

  res.json({
    success: true,
    data: {
      items: items.map((d) => ({
        id: d._id,
        name: d.name,
        source: d.source,
        startedAt: d.startedAt,
        finishedAt: d.finishedAt,
        durationMs: d.durationMs,
        ok: d.ok,
        error: d.error,
        stats: d.stats,
        triggeredBy: d.triggeredBy,
        pid: d.pid
      })),
      total,
      page,
      pageSize,
      filter
    }
  })
}