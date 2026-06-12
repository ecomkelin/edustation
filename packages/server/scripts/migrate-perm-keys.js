'use strict'

/**
 * 一次性数据迁移：把 Position.permissions 里的旧权限码替换为新权限码。
 *
 * 背景：seed 文件 + position.service.js 默认值已改为新权限码（studentWork.* 等），
 * 但 ensureDefaultPositions 幂等不覆盖已有职位；MVP dev 阶段数据库已存在的
 * Position 文档仍是旧值，导致侧边菜单按新 perm 过滤后被隐藏。
 *
 * 用法：node packages/server/scripts/migrate-perm-keys.js
 * 幂等：再跑一次找不到任何旧 perm → 0 touched，干净退出。
 *
 * 上线后该脚本可保留为运维工具；后续如再做大改 key 重命名，加映射表即可。
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const Position = require('@models/Position.model')

const KEY_MAP = {
  'lessonWork.read': 'studentWork.read',
  'lessonWork.write': 'studentWork.write'
}

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-perm-keys] connected')

  const positions = await Position.find({}).lean()
  // eslint-disable-next-line no-console
  console.log(`[migrate-perm-keys] found ${positions.length} positions`)

  let touched = 0
  let oldCount = 0
  for (const p of positions) {
    let mutated = false
    const next = []
    for (const k of (p.permissions || [])) {
      if (KEY_MAP[k]) {
        next.push(KEY_MAP[k])
        oldCount++
        mutated = true
      } else {
        next.push(k)
      }
    }
    // 去重
    const dedup = Array.from(new Set(next))
    if (dedup.length !== next.length) mutated = true
    if (mutated) {
      await Position.updateOne({ _id: p._id }, { $set: { permissions: dedup } })
      touched++
      // eslint-disable-next-line no-console
      console.log(`  [touched] ${p.name} (org=${String(p.org).slice(-6)}): ${p.permissions.length} → ${dedup.length} perms`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate-perm-keys] summary: touched=${touched}, old-keys-found=${oldCount}`)
  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-perm-keys] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-perm-keys] failed:', e)
  process.exit(1)
})
