'use strict'

/**
 * 服务端启动时跑的"轻量级迁移"集中点.
 *
 * 与一次性 scripts/ 下的迁移脚本的差异:
 *   - scripts/ 是手工/运维触发, 一次性, 跑完即弃
 *   - 这里的是启动时**自动**跑的"补救型"修复, 必须**幂等**, 业务运行中无害
 *
 * 设计:
 *   - 每条迁移独立 try/catch; 一条失败**不**阻塞 server 启动, 只 log
 *   - 重复启动 N 次效果一样 (no-op)
 *   - 不引入 mongoose 事务; 都是 metadata 操作
 *
 * 新增迁移: 在 migrations 数组里 push 一个 async () => {} 即可
 */

const mongoose = require('mongoose')

/* ─── 迁移 1: Lead.phone 取消 unique ────────────────────
 * 背景 (2026-06):
 *   业务上允许 1 家长带多孩, 同 phone 下可创建多个 Lead.
 *   Lead.model.js 源码已把 `{org, phone}` 改为普通 index, 但 mongoose 启动
 *   autoIndex 不会 drop 老 unique, DB 层残留的唯一约束仍会触发 E11000.
 *   用户在前端点"为这个手机号加一个孩子" (force=true) 仍会被 DB 挡掉.
 *
 * 修法:
 *   启动时主动 drop 老 `{org:1, phone:1}` unique, 再 syncIndexes 重建非唯一版本.
 *   幂等: 已 drop 过或不存在时 no-op.
 */
async function dropLeadPhoneUniqueIndex() {
  const coll = mongoose.connection.db.collection('leads')
  let indexes
  try {
    indexes = await coll.indexes()
  } catch (e) {
    // collection 还不存在 (空库 / 全新环境) — 跳过
    if (e && (e.codeName === 'NamespaceNotFound' || e.code === 26)) return 'no-op-empty'
    throw e
  }
  const target = indexes.find((i) =>
    i.unique === true
    && i.key
    && i.key.org === 1
    && i.key.phone === 1
  )
  if (!target) return 'no-op'

  // eslint-disable-next-line no-console
  console.log(`[startup-migrations] dropping leads unique index: ${target.name}`)
  await coll.dropIndex(target.name)

  // 触发 mongoose 重建 Lead schema 上声明的非唯一 index
  // 延迟 require, 避免循环依赖 (connect 阶段 model 还未 require)
  const Lead = require('@models/Lead.model')
  await Lead.syncIndexes()
  return `dropped:${target.name}`
}

/* ─── 注册: 按顺序跑 ─────────────────────────────────── */
const migrations = [
  { name: 'drop-lead-phone-unique', run: dropLeadPhoneUniqueIndex }
]

/**
 * 跑所有启动迁移, 任一失败不阻塞.
 * @returns {Promise<Array<{name, status, error?}>>}
 */
async function runStartupMigrations() {
  const results = []
  for (const m of migrations) {
    try {
      const status = await m.run()
      // eslint-disable-next-line no-console
      console.log(`[startup-migrations] ${m.name}: ${status}`)
      results.push({ name: m.name, status })
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[startup-migrations] ${m.name} FAILED: ${e && e.message}`)
      results.push({ name: m.name, status: 'failed', error: e && e.message })
    }
  }
  return results
}

module.exports = { runStartupMigrations }
