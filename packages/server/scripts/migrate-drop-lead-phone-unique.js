'use strict'

/**
 * 一次性数据迁移: 删除 leads collection 上残留的 {org, phone} unique index.
 *
 * 背景:
 *   2026-06 业务改造: 1 家长带多孩场景下, 同 phone 允许多 Lead 记录.
 *   Lead.model.js 源码已将 phone unique index 改为普通 index, 但 mongoose 启动
 *   autoIndex 不会 drop 老的 unique index, 数据库层残留的 unique 约束仍在 —
 *   用户点"为这个手机号加一个孩子" (force=true) 创建第二个 Lead 时, DB 层直接
 *   E11000 duplicate key error, 即"字段 org 已存在".
 *
 * 用法: node packages/server/scripts/migrate-drop-lead-phone-unique.js
 * 幂等: 已 drop 过或无残留 index 时, 不报错, 提示 "no-op".
 *
 * 现状 (2026-06-15): server 启动时 @utils/startupMigrations.js#dropLeadPhoneUniqueIndex
 *   也会自动跑同样的修复; 本脚本保留为运维手动/兜底工具, 重启 server 即可不必再跑.
 *
 * 安全:
 *   - db.collection.dropIndex() 是 metadata 操作, 不锁表, 业务运行中可执行
 *   - 老数据本身 unique 不会"删后变 2", 删后允许同 phone 多条新数据
 *
 * 上线后保留为运维工具, 重复跑无害.
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const mongoose = require('mongoose')

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-drop-lead-phone-unique] connected')

  const coll = mongoose.connection.db.collection('leads')

  // 1) 列出现有 indexes
  let indexes
  try {
    indexes = await coll.indexes()
  } catch (e) {
    // collection 还不存在 (空库) — 跳过
    if (e && (e.codeName === 'NamespaceNotFound' || e.code === 26)) {
      // eslint-disable-next-line no-console
      console.log('[migrate-drop-lead-phone-unique] leads collection 不存在, 无需迁移, 退出')
      await disconnect()
      return
    }
    throw e
  }
  // eslint-disable-next-line no-console
  console.log('[migrate-drop-lead-phone-unique] 现有 indexes:')
  for (const idx of indexes) {
    // eslint-disable-next-line no-console
    console.log(`  - name=${idx.name}  key=${JSON.stringify(idx.key)}  unique=${!!idx.unique}`)
  }

  // 2) 找 {org:1, phone:1} unique 的
  const target = indexes.find((i) =>
    i.unique === true
    && i.key && i.key.org === 1 && i.key.phone === 1
  )
  if (!target) {
    // eslint-disable-next-line no-console
    console.log('[migrate-drop-lead-phone-unique] 未发现残留 unique index, 无需迁移, 退出')
    await disconnect()
    return
  }

  // 3) drop
  // eslint-disable-next-line no-console
  console.log(`[migrate-drop-lead-phone-unique] drop index: ${target.name}`)
  await coll.dropIndex(target.name)

  // 4) 触发 mongoose 重新同步非唯一 index
  const Lead = require('@models/Lead.model')
  await Lead.syncIndexes()
  // eslint-disable-next-line no-console
  console.log('[migrate-drop-lead-phone-unique] 已重建非唯一 indexes')

  // 5) 验证
  const after = await coll.indexes()
  // eslint-disable-next-line no-console
  console.log('[migrate-drop-lead-phone-unique] 迁移完成, 现有 indexes:')
  for (const idx of after) {
    // eslint-disable-next-line no-console
    console.log(`  - name=${idx.name}  key=${JSON.stringify(idx.key)}  unique=${!!idx.unique}`)
  }

  await disconnect()
}

main().catch(async (e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-drop-lead-phone-unique] FAILED:', e && e.message)
  try { await disconnect() } catch (_) {}
  process.exit(1)
})
