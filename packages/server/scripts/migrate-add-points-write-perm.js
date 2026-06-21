'use strict'

/**
 * 一次性数据迁移: 给历史机构的「管理员」「教务」系统职位加 points.write 权限码
 *
 * 背景 (2026-06-21): 积分管理 (PointsAdmin) 模块上线，新增 points.write 权限码
 *   - DEFAULT_POSITIONS 已加上, 新建机构自动生效
 *   - 但历史机构已存在的 Position 文档需要补, ensureDefaultPositions 幂等不动旧 doc
 *
 * 用法: node packages/server/scripts/migrate-add-points-write-perm.js
 * 幂等: $addToSet + $nin 前置过滤, 多次跑不会重复添加
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const Position = require('@models/Position.model')

const POINTS_WRITE_PERMS = ['points.write']

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-points-write-perm] connected')

  const result = await Position.updateMany(
    {
      isSystem: true,
      name: { $in: ['管理员', '教务'] },
      permissions: { $nin: POINTS_WRITE_PERMS }
    },
    { $addToSet: { permissions: { $each: POINTS_WRITE_PERMS } } }
  )
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-points-write-perm] positions touched: ${result.modifiedCount} / matched: ${result.matchedCount}`)

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-points-write-perm] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-add-points-write-perm] failed:', e)
  process.exit(1)
})
