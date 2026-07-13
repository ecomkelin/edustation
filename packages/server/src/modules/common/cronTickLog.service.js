'use strict'

/**
 * CronTickLog 写入服务 (2026-07-13 立项, MM=41 续)
 *
 * 单一职责: 把 cron tick 的开始/结束/跳过 写到 cron_tick_logs 表。
 * cronRegistry 调这里, 业务 cron 不直接调。
 *
 * 设计:
 *   - recordStart 返回 logId, recordFinish(recordId, {...}) 写结束字段
 *   - recordSkip 一条搞定 (没抢到锁, 整个事件只有 startedAt)
 *   - 写入失败 try/catch 兜底, 绝不 throw (写日志不能影响 cron 主流程)
 *   - 不打 console (cronLogger 已经打; 这里只写 DB)
 *
 * 用法 (在 cronRegistry helper.finish / helper.skip / runManualTick 出口调):
 *
 *   const startMs = helper.start()
 *   const logId = await tickLog.recordStart(name, 'auto')  // 立即 flush
 *   try {
 *     const stats = await doWork()
 *     await tickLog.recordFinish(logId, { ok: true, stats })
 *   } catch (e) {
 *     await tickLog.recordFinish(logId, { ok: false, error: e })
 *   }
 */

const CronTickLog = require('@models/CronTickLog.model')

/**
 * 记一条"开始 tick"
 *
 * @param {string} name  cron 名
 * @param {'auto'|'manual'} source
 * @param {string|null} [triggeredBy] 手动 trigger 时填
 * @returns {Promise<string|null>} logId (mongo _id); 写入失败返 null
 */
async function recordStart(name, source, triggeredBy = null) {
  try {
    const doc = await CronTickLog.create({
      name,
      source,
      startedAt: new Date(),
      ok: false, // 默认 false, 写 finish 时再改
      pid: process.pid,
      triggeredBy
    })
    return doc._id
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[cronTickLog] recordStart failed for "${name}":`, e.message)
    return null
  }
}

/**
 * 记一条"结束 tick", update 开始时记的 doc
 *
 * 2026-07-13 fix: 不再依赖 recordStart 同步返 logId (recordStart 是 fire-and-forget,
 *   recordFinish 调用时 logId 可能还没 flush, 之前会因 logId=null 跳过导致 doc 永远
 *   stuck at ok=false / stats=null)。改为按 (name, pid, startedAt close) 查最新一条
 *   未 finished 的 doc, 然后 update — 这样 recordStart 即使慢一点也找得到。
 *
 * @param {string|null} logId  recordStart 返的 _id; 已弃用, 保留参数兼容老调用方
 * @param {{
 *   name: string,            // 必传, 限定查询范围
 *   pid: number,             // 必传, 多进程隔离
 *   ok: boolean,
 *   stats?: object|null,
 *   error?: Error|string|null,
 *   startedAt: number        // 必传, 算 durationMs 用, 同时也是找 doc 的 secondary key
 * }} payload
 */
async function recordFinish(logId, payload) {
  const { name, pid, ok, stats = null, error = null, startedAt } = payload
  if (!name || !Number.isInteger(pid)) {
    // eslint-disable-next-line no-console
    console.warn(`[cronTickLog] recordFinish missing name/pid, skip`)
    return
  }
  const finishedAt = new Date()
  const durationMs = typeof startedAt === 'number' ? finishedAt.getTime() - startedAt : 0
  const errorMsg = error
    ? (error && error.message ? String(error.message) : String(error))
    : null
  try {
    // 找该进程该 cron 的最新一条未 finished 的 doc
    // 容忍 ±500ms 误差 (recordStart 写入时刻 vs finish 推算时刻 可能差几 ms)
    const matchStartedAt = typeof startedAt === 'number' ? new Date(startedAt) : null
    const filter = {
      name,
      pid,
      finishedAt: null
    }
    if (matchStartedAt) {
      // 找 startedAt 最接近的 (差值 ≤ 2s, 覆盖慢 mongo 写入 + 业务执行)
      filter.startedAt = {
        $gte: new Date(matchStartedAt.getTime() - 2000),
        $lte: new Date(matchStartedAt.getTime() + 2000)
      }
    }
    // 优先用 logId 精确更新 (recordStart 早就 flush 了的情况)
    if (logId) {
      const r = await CronTickLog.updateOne(
        { _id: logId },
        {
          $set: {
            finishedAt,
            durationMs,
            ok: !!ok,
            stats: ok ? stats : null,
            error: errorMsg
          }
        }
      )
      if (r.matchedCount > 0) return
    }
    // 退路: 按 (name, pid, startedAt 近似) 查最新未 finished 的
    //   注意: updateOne 不支持 sort 选项, 所以用 findOneAndUpdate 一步完成
    const recent = await CronTickLog.findOneAndUpdate(
      filter,
      {
        $set: {
          finishedAt,
          durationMs,
          ok: !!ok,
          stats: ok ? stats : null,
          error: errorMsg
        }
      },
      { sort: { startedAt: -1 } }
    )
    if (!recent) {
      // eslint-disable-next-line no-console
      console.warn(`[cronTickLog] recordFinish: no recent log found for ${name} pid=${pid} (startMs=${startedAt})`)
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[cronTickLog] recordFinish failed for ${name} pid=${pid}:`, e.message)
  }
}

/**
 * 记一条"跳过 (没抢到锁)", 整个事件 1 条
 *
 * @param {string} name  cron 名
 */
async function recordSkip(name) {
  try {
    await CronTickLog.create({
      name,
      source: 'skip',
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 0,
      ok: true, // skip 不算错
      stats: { reason: 'lock_held_by_other_replica' },
      pid: process.pid,
      triggeredBy: null
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[cronTickLog] recordSkip failed for "${name}":`, e.message)
  }
}

module.exports = { recordStart, recordFinish, recordSkip }