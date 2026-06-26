'use strict'

/**
 * 一次性迁移：给已有机构的 5 个系统岗位按 name 补齐 finance.read / finance.write 权限 (2026-06-25 立项)
 *
 * 背景：财务模块立项后 DEFAULT_POSITIONS 和 initial.data.json 已同步新权限码,
 *       但已有机构 (跑过早期 db:seeds) 的 Position 文档没自动拿到新权限码
 *       (position.service.ensureDefaultPositions 只补 name 缺失的, 不会改已有职位的 permissions).
 *
 * 策略 (per [[dev-stage-no-backcompat]] 开发阶段决策):
 *   - 直接 updateMany 补缺, 不写兼容 shim
 *   - 仅按"系统岗位名 + name 对应权限集"加; 用户自建岗位不动
 *   - 写完打印每个岗位 modifiedCount 方便排查
 *
 * 用法: node scripts/db/_migrate-finance-permissions.js [--dry-run]
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const Position = require('@models/Position.model')

const DRY_RUN = process.argv.includes('--dry-run')

// name -> 需要追加的权限码; 不在表里的岗位不动
// 与 packages/server/src/modules/position/position.service.js 的 DEFAULT_POSITIONS 保持一致
const POSITION_PERMISSION_PATCH = {
  '管理员': ['finance.read', 'finance.write'],
  '教务': ['finance.read'],
  '财务': ['finance.read', 'finance.write']
}

async function main() {
  console.log(`[migrate-finance-permissions] starting ${DRY_RUN ? '(DRY RUN)' : ''}`)

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rgzw')
  const dbName = mongoose.connection.db.databaseName
  console.log(`[migrate-finance-permissions] connected to ${dbName}`)

  const allPositions = await Position.find({ name: { $in: Object.keys(POSITION_PERMISSION_PATCH) } })
    .select('_id org name permissions')
    .lean()

  console.log(`[migrate-finance-permissions] found ${allPositions.length} positions to inspect`)

  const summary = []
  for (const pos of allPositions) {
    const toAdd = POSITION_PERMISSION_PATCH[pos.name] || []
    const existing = new Set(pos.permissions || [])
    const missing = toAdd.filter((p) => !existing.has(p))
    if (missing.length === 0) {
      summary.push({ name: pos.name, org: String(pos.org), action: 'skip' })
      continue
    }
    if (DRY_RUN) {
      summary.push({ name: pos.name, org: String(pos.org), action: 'would-add', perms: missing })
      continue
    }
    const r = await Position.updateOne(
      { _id: pos._id },
      { $addToSet: { permissions: { $each: missing } } }
    )
    summary.push({
      name: pos.name,
      org: String(pos.org),
      action: r.modifiedCount > 0 ? 'updated' : 'noop',
      perms: missing
    })
  }

  console.log('[migrate-finance-permissions] summary:')
  for (const s of summary) {
    console.log('  -', JSON.stringify(s))
  }
  const updated = summary.filter((s) => s.action === 'updated').length
  const skipped = summary.filter((s) => s.action === 'skip').length
  console.log(
    `[migrate-finance-permissions] done. updated=${updated} skipped=${skipped} (dry-run=${DRY_RUN})`
  )

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error('[migrate-finance-permissions] failed:', e)
  process.exit(1)
})
