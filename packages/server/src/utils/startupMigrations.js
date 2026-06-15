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

/* ─── 迁移 1: 清理旧 Lead collection (2026-06 大重构) ────────────
 * 背景:
 *   2026-06 招生模块从 Lead (孩子维度) 重构为 Parent + ChildLead (家长 + 孩子维度).
 *   旧 leads / lead_activities collection 与新 model 不兼容, 需在 server 启动时主动 drop.
 *   开发期 (无真实数据) 阶段直接清空; 阶段 2 上线前需要先备份再删.
 *
 * 幂等: 库无该 collection → no-op-empty; 库有 → drop 一次.
 */
async function dropLegacyLeadCollections() {
  const names = ['leads', 'lead_activities']
  const dropped = []
  for (const name of names) {
    try {
      const collections = await mongoose.connection.db
        .listCollections({ name })
        .toArray()
      if (collections.length === 0) continue
      // eslint-disable-next-line no-console
      console.log(`[startup-migrations] dropping legacy collection: ${name}`)
      await mongoose.connection.db.collection(name).drop()
      dropped.push(name)
    } catch (e) {
      // 兼容: NamespaceNotFound / collection 已被人手动 drop 掉
      if (e && (e.codeName === 'NamespaceNotFound' || e.code === 26)) continue
      throw e
    }
  }
  return dropped.length ? `dropped:${dropped.join(',')}` : 'no-op'
}

/* ─── 注册: 按顺序跑 ─────────────────────────────────── */
const migrations = [
  { name: 'drop-legacy-lead-collections', run: dropLegacyLeadCollections }
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
