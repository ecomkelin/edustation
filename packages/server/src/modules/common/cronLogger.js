'use strict'

/**
 * Cron 日志格式统一 (2026-07-13 立项)
 *
 * 格式:
 *   pid=<pid> uptime=+<sec>s [<name>] <action> <key>=<val> ...
 *
 *   - pid: 进程号, 多副本部署时一眼区分
 *   - uptime: 启动后秒数, 排查"启动多久后开始跑" / "刚启动 tick 一下又崩" 等
 *   - <name>: cron 模块名 (与 registry 一致)
 *   - <action>: tick / warn / fail
 *   - <key>=<val>: 任意上下文 (e.g. expired=3 generated=2)
 *
 * 简化:
 *   - 0/null/空字符串的字段省略, 避免日志噪声
 *   - warn 走 console.warn (仍带完整前缀, grep 友好)
 *   - tick 走 console.log
 *
 * 用法:
 *   const cronLog = require('@modules/common/cronLogger')
 *   cronLog.tick('archiveCron', { task: 5, studentWork: 0, attendance: 1 })
 *   // → "pid=12345 uptime=+3602s [archiveCron] tick: task=5 attendance=1"
 *
 *   cronLog.fail('taskCron', err, { where: 'expireOverdue' })
 *   // → "[cron] pid=12345 uptime=+3602s [taskCron] fail where=expireOverdue: ENOENT: ..."
 */

const registry = require('./cronRegistry')

function fmt() {
  return `pid=${process.pid} uptime=+${registry.uptimeSec()}s`
}

/**
 * 正常 tick 完成日志 (console.log)
 *
 * @param {string} name    cron 名 (与 registry.register 一致)
 * @param {object} stats   任意 kv, 0/null/空字符串会被省略
 */
function tick(name, stats = {}) {
  const parts = [fmt(), `[${name}]`, 'tick:']
  for (const [k, v] of Object.entries(stats)) {
    if (v === 0 || v === null || v === undefined || v === '') continue
    parts.push(`${k}=${v}`)
  }
  // eslint-disable-next-line no-console
  console.log(parts.join(' '))
}

/**
 * tick 失败日志 (console.warn)
 *
 * @param {string} name
 * @param {Error}  err
 * @param {object} [ctx]   可选上下文 (e.g. { where: 'expireOverdue' })
 */
function fail(name, err, ctx = {}) {
  const parts = [fmt(), `[${name}]`, 'fail']
  for (const [k, v] of Object.entries(ctx)) {
    if (v === null || v === undefined || v === '') continue
    parts.push(`${k}=${v}`)
  }
  const msg = err && err.message ? String(err.message) : String(err)
  // eslint-disable-next-line no-console
  console.warn(`${parts.join(' ')}: ${msg}`)
}

module.exports = { tick, fail }