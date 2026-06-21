'use strict'

/**
 * 一次性数据迁移: 给历史机构加 accessControl.* 权限码
 *
 * 背景: 人脸识别门禁 (2026-06) 新增 accessControl 权限组 (accessControl.read/write/pickup);
 *   - DEFAULT_POSITIONS 已加上, 新建机构自动生效
 *   - 但历史机构已存在的 Position 文档需要补, ensureDefaultPositions 幂等不动旧 doc
 *
 * 用法: node packages/server/scripts/migrate-add-access-control-perms.js
 * 幂等: $addToSet + $nin 前置过滤, 多次跑不会重复添加
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const Position = require('@models/Position.model')

const ACCESS_CONTROL_PERMS = ['accessControl.read', 'accessControl.write', 'accessControl.pickup']

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-access-control-perms] connected')

  // 管理员/教务 全挂 (read/write/pickup)
  const adminJiaowu = await Position.updateMany(
    {
      isSystem: true,
      name: { $in: ['管理员', '教务'] },
      permissions: { $nin: ['accessControl.read'] }
    },
    { $addToSet: { permissions: { $each: ACCESS_CONTROL_PERMS } } }
  )
  // eslint-disable-next-line no-console
  console.log(
    `[migrate-add-access-control-perms] 管理员/教务: touched=${adminJiaowu.modifiedCount} matched=${adminJiaowu.matchedCount}`
  )

  // 老师/财务 仅挂 read
  const teacherFinance = await Position.updateMany(
    {
      isSystem: true,
      name: { $in: ['老师', '财务'] },
      permissions: { $nin: ['accessControl.read'] }
    },
    { $addToSet: { permissions: 'accessControl.read' } }
  )
  // eslint-disable-next-line no-console
  console.log(
    `[migrate-add-access-control-perms] 老师/财务: touched=${teacherFinance.modifiedCount} matched=${teacherFinance.matchedCount}`
  )

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-access-control-perms] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-add-access-control-perms] failed:', e)
  process.exit(1)
})
