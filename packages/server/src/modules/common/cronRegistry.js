'use strict'

/**
 * Cron 注册表 (2026-07-13 立项)
 *
 * 用途:
 *   - 集中记录所有 setInterval-based 定时任务的状态, 供 /admin/cron/status 端点查
 *   - 统一启动时间 (BOOT_TIME), 让所有 cron 的 uptime 日志可比
 *
 * 设计:
 *   - 启动时 BOOT_TIME 一次捕获, 后续用 uptimeSec() 取进程启动后秒数
 *   - 每个 cron 调用 register(name, intervalMs) 声明; 返回 helper 提供 start()/finish()
 *     两个钩子, 在 cron tick 前后调一次即可自动累计 stats
 *   - 跨进程数据不持久化 (进程重启清零), 仅作运维可观测性
 *   - 不阻塞 cron 执行: helper 只更新内存 map, 不写 DB
 *
 * 暴露:
 *   - register(name, intervalMs)        — 注册并返回 cron helper
 *   - listAll()                         — 给 status 端点用, 返回 [{ name, intervalMs, ...stats }]
 *   - uptimeSec() / bootTime()          — 给 logger 用, 输出 pid + uptime
 *
 * 配合:
 *   - cronLogger 用 uptimeSec() 拼统一格式: `pid=12345 uptime=+1234s [archiveCron] tick: ...`
 *   - /admin/cron/status 端点调 listAll() 给管理后台展示
 */

const BOOT_TIME = Date.now()

// name → { name, intervalMs, lastRunAt, lastDurationMs, lastError,
//          totalTicks, totalErrors, registeredAt,
//          options: { leaderElect, lockTtlMs },
//          timer: NodeJS.Timeout | null,
//          tickFn: () => Promise<any> | null,
//          manualTickInFlight: { startedAt: Date, by: string } | null  }
const crons = new Map()

// 手动 trigger 互斥: 同一进程内同时只允许 1 个手动 tick 在跑 (R-4102 防并发)
// key = name, value = {startedAt, by}
const manualTickLocks = new Map()

/**
 * 注册一个 cron
 *
 * @param {string} name             — 显示名, e.g. 'archiveCron'
 * @param {number} intervalMs       — setInterval 周期 (毫秒)
 * @param {Object} [options]
 * @param {boolean} [options.leaderElect=false]
 *   多副本部署时, 此 cron 只能让一个进程跑 (用 mongo 互斥锁)
 *   副作用类的 (taskCron / notificationCron / petCron) 必须开
 *   纯幂等的 (archiveCron / loginRateLimitSweep / captchaSweep) 不必
 * @param {number} [options.lockTtlMs=30000]
 *   leaderElect=true 时, 抢锁 TTL; tick 超时会自动让出
 *
 * @returns {{
 *   start: () => number,
 *   finish: (err?: Error, startMs?: number) => void,
 *   attachTimer: (timer: NodeJS.Timeout) => void,
 *   cancel: () => void
 * }}
 */
function register(name, intervalMs, options = {}) {
  if (crons.has(name)) {
    // eslint-disable-next-line no-console
    console.warn(`[cronRegistry] duplicate registration for "${name}", overwriting`)
  }
  const entry = {
    name,
    intervalMs,
    lastRunAt: null,
    lastDurationMs: null,
    lastError: null,
    totalTicks: 0,
    totalSkipped: 0, // leaderElect=true 时被其他进程抢走锁的次数
    totalErrors: 0,
    totalManualTicks: 0, // 手动触发次数 (R-4102 POST /:name/tick)
    registeredAt: new Date(),
    options: {
      leaderElect: !!options.leaderElect,
      lockTtlMs: options.lockTtlMs || 30 * 1000
    },
    timer: null,
    tickFn: null  // 手动 trigger 用, setTickFn() 注入
  }
  crons.set(name, entry)

  return {
    /**
     * 在 cron tick 入口调一次, 返回 startMs (毫秒), 给 finish 用
     */
    start() {
      entry.lastRunAt = new Date()
      return Date.now()
    },
    /**
     * 在 cron tick 出口调一次
     * @param {Error|null} err
     * @param {number} startMs  start() 返回的 startMs
     */
    finish(err, startMs) {
      const dur = typeof startMs === 'number' ? Date.now() - startMs : null
      entry.lastDurationMs = dur
      entry.totalTicks++
      if (err) {
        entry.lastError = err && err.message ? String(err.message) : String(err)
        entry.totalErrors++
      } else {
        entry.lastError = null
      }
    },
    /**
     * 标记本 tick 跳过 (leaderElect=true 但没抢到锁)
     * 不增 totalTicks, 只增 totalSkipped
     */
    skip() {
      entry.totalSkipped++
      entry.lastRunAt = new Date() // 仍记, 方便排查
    },
    /**
     * 注册时把 setInterval 的 timer 存到这里, 给 shutdownAll 用
     */
    attachTimer(timer) {
      entry.timer = timer
    },
    /**
     * 取消单个 cron (内部用, 一般走 shutdownAll)
     */
    cancel() {
      if (entry.timer) {
        clearInterval(entry.timer)
        entry.timer = null
      }
    }
  }
}

/**
 * 注入手动 trigger 的 tick 函数 (R-4102 用)
 * 必须在 register() 之后调; 否则报 NOT_FOUND
 *
 * @param {string} name  cron 名
 * @param {() => Promise<any>} tickFn
 */
function setTickFn(name, tickFn) {
  const entry = crons.get(name)
  if (!entry) {
    throw new Error(`[cronRegistry] setTickFn: cron "${name}" not registered`)
  }
  entry.tickFn = tickFn
}

/**
 * 取手动 trigger 的 tick 函数
 * @param {string} name
 * @returns {(() => Promise<any>) | null}
 */
function getTickFn(name) {
  const entry = crons.get(name)
  return entry ? entry.tickFn : null
}

/**
 * 手动跑一次 (R-4102 用). 绕过 leader 锁 (admin 显式触发).
 *
 * 进程内互斥 (2026-07-13): 同一进程同时只允许 1 个手动 tick 跑该 cron.
 *   - 第二个并发请求返回 { ok: false, error: 'already_running', ... }, controller 转 409
 *   - 跨副本: 不同进程互不感知 (按设计, admin 想打哪个副本直接打)
 *   - leader 锁的跨副本互斥**不**在这里强制 (手动 tick by design 绕开 leader)
 *
 * 计数加在 totalManualTicks; 总耗时仍记录到 lastDurationMs.
 *
 * @param {string} name
 * @param {string} [triggeredBy] 调用方标识 (写到 manualTickInFlight 让其他 admin 看到)
 * @returns {Promise<{ok: boolean, result?: any, error?: string, errorCode?: string, durationMs: number, conflict?: {startedAt, by, secondsAgo}}>}
 */
async function runManualTick(name, triggeredBy = 'unknown') {
  const entry = crons.get(name)
  if (!entry) {
    return { ok: false, error: `cron "${name}" not found`, durationMs: 0 }
  }
  if (!entry.tickFn) {
    return { ok: false, error: `cron "${name}" has no tickFn registered`, durationMs: 0 }
  }
  // 进程内互斥检查
  const existing = manualTickLocks.get(name)
  if (existing) {
    const secondsAgo = Math.floor((Date.now() - existing.startedAt.getTime()) / 1000)
    return {
      ok: false,
      errorCode: 'already_running',
      error: `cron "${name}" is already running (started ${secondsAgo}s ago by ${existing.by})`,
      durationMs: 0,
      conflict: {
        startedAt: existing.startedAt,
        by: existing.by,
        secondsAgo
      }
    }
  }
  // 占位
  const inFlight = { startedAt: new Date(), by: triggeredBy }
  manualTickLocks.set(name, inFlight)
  entry.manualTickInFlight = inFlight
  const start = Date.now()
  entry.totalManualTicks++
  try {
    const result = await entry.tickFn()
    entry.lastDurationMs = Date.now() - start
    entry.lastRunAt = new Date()
    return { ok: true, result, durationMs: entry.lastDurationMs }
  } catch (e) {
    entry.lastDurationMs = Date.now() - start
    entry.lastError = e && e.message ? String(e.message) : String(e)
    entry.totalErrors++
    return { ok: false, error: entry.lastError, durationMs: entry.lastDurationMs }
  } finally {
    manualTickLocks.delete(name)
    entry.manualTickInFlight = null
  }
}

/**
 * 列出所有已注册 cron (供 /admin/cron/status 端点用)
 */
function listAll() {
  return Array.from(crons.values()).map((c) => ({
    name: c.name,
    intervalMs: c.intervalMs,
    intervalHuman: humanInterval(c.intervalMs),
    lastRunAt: c.lastRunAt,
    lastDurationMs: c.lastDurationMs,
    lastError: c.lastError,
    totalTicks: c.totalTicks,
    totalSkipped: c.totalSkipped,
    totalErrors: c.totalErrors,
    totalManualTicks: c.totalManualTicks,
    registeredAt: c.registeredAt,
    leaderElect: c.options.leaderElect,
    hasManualTickFn: typeof c.tickFn === 'function',
    // 当前是否有手动 tick 在跑 (R-4102 进程内互斥)
    manualTickInFlight: c.manualTickInFlight ? {
      startedAt: c.manualTickInFlight.startedAt,
      by: c.manualTickInFlight.by
    } : null,
    // 距上次跑过多久 (秒); 从未跑过 → null
    secondsSinceLastRun: c.lastRunAt ? Math.floor((Date.now() - c.lastRunAt.getTime()) / 1000) : null
  }))
}

/**
 * 优雅停机: clearInterval 所有 cron
 * main.js SIGTERM/SIGINT 调一次
 */
function shutdownAll() {
  for (const entry of crons.values()) {
    if (entry.timer) {
      clearInterval(entry.timer)
      entry.timer = null
    }
  }
}

function uptimeSec() {
  return Math.floor((Date.now() - BOOT_TIME) / 1000)
}

function bootTime() {
  return BOOT_TIME
}

function humanInterval(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}min`
  return `${Math.round(ms / 3_600_000)}h`
}

module.exports = { register, listAll, setTickFn, getTickFn, runManualTick, shutdownAll, uptimeSec, bootTime, humanInterval, BOOT_TIME }