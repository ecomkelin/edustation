'use strict'

/**
 * 一次性迁移: 清理 Position.permissions 里所有 game.* 残留权限码 (2026-07-11)
 *
 * 背景:
 *   - 2026-07-04 "游戏模块" 从产品下线, shared/permissions.json 已删除 game.* 整组
 *   - 但历史 Position 文档里残留了 'game.read' / 'game.write' 等权限码
 *   - admin 前端加载职位详情时, 用 shared/permissions.json 白名单比对,
 *     找不到 game.read → 红色 toast "权限码 game.read 不存在"
 *     (代码: packages/admin/src/views/system/position/*.vue)
 *
 * 策略 (per CLAUDE.md §0 开发阶段, 全新优化, 不写兼容 shim):
 *   - updateMany 直接 $pull 所有以 'game.' 开头的权限码
 *   - 仅清 game.*; 其它历史残留不在本次范围
 *   - --dry-run (默认) 只统计; --apply 才真正写
 *
 * 用法:
 *   node scripts/db/_migrate-cleanup-game-permissions.js           # 默认 dry-run
 *   node scripts/db/_migrate-cleanup-game-permissions.js --dry-run # 显式 dry-run
 *   node scripts/db/_migrate-cleanup-game-permissions.js --apply   # 真正执行
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const Position = require('@models/Position.model')

const APPLY = process.argv.includes('--apply')
const DRY_RUN = !APPLY

async function main() {
  console.log(`[cleanup-game-permissions] starting ${DRY_RUN ? '(DRY RUN, no writes)' : '(APPLY) — will write DB'}`)

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rgzw')
  const dbName = mongoose.connection.db.databaseName
  console.log(`[cleanup-game-permissions] connected to ${dbName}`)

  // 1. 统计: 哪些文档包含 game.*
  const matched = await Position.find({ permissions: { $regex: /^game\./ } })
    .select('_id org name permissions')
    .lean()

  console.log(`[cleanup-game-permissions] matched ${matched.length} positions with game.* in permissions`)

  // 2. 详细列出每个职位被清理的具体权限码 + 清理后剩余权限数
  const summary = []
  for (const pos of matched) {
    const before = (pos.permissions || []).filter((p) => typeof p === 'string')
    const toRemove = before.filter((p) => p.startsWith('game.'))
    summary.push({
      _id: String(pos._id),
      org: String(pos.org),
      name: pos.name,
      removed: toRemove,
      totalBefore: before.length,
      totalAfter: before.length - toRemove.length
    })
    if (DRY_RUN) {
      console.log(`  - [DRY] would-clean ${pos.name} (org=${String(pos.org)}) game.*=${JSON.stringify(toRemove)} (${before.length} → ${before.length - toRemove.length})`)
    }
  }

  if (DRY_RUN) {
    const totalGamePerms = summary.reduce((s, x) => s + x.removed.length, 0)
    console.log(`[cleanup-game-permissions] DRY-RUN summary: positions=${matched.length} gamePermsToRemove=${totalGamePerms}`)
    console.log('[cleanup-game-permissions] re-run with --apply to actually write')
    await mongoose.disconnect()
    process.exit(0)
  }

  // 3. APPLY 模式: updateMany 一次写完
  const r = await Position.updateMany(
    { permissions: { $regex: /^game\./ } },
    { $pull: { permissions: { $regex: /^game\./ } } }
  )

  console.log('[cleanup-game-permissions] updateMany result:')
  console.log('  - matchedCount:', r.matchedCount)
  console.log('  - modifiedCount:', r.modifiedCount)

  // 4. 复核: 应该没有残留了
  const remaining = await Position.countDocuments({ permissions: { $regex: /^game\./ } })
  console.log(`[cleanup-game-permissions] verification: positions still with game.* = ${remaining} (期望 0)`)

  if (remaining > 0) {
    console.error('[cleanup-game-permissions] ⚠️  仍有残留, 请人工排查')
    process.exit(2)
  }

  console.log('[cleanup-game-permissions] done ✓')
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error('[cleanup-game-permissions] failed:', e)
  process.exit(1)
})