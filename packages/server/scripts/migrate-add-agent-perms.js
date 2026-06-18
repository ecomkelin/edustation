'use strict'

/**
 * 一次性数据迁移: 给历史机构的「管理员」「教务」系统职位加 agent.* 权限码
 *
 * 背景: 管理后台 AI 助手 (2026-06) 新增 agent 权限组 (agent.read / agent.write);
 *   - DEFAULT_POSITIONS 已加上, 新建机构自动生效
 *   - 但历史机构已存在的 Position 文档需要补, ensureDefaultPositions 幂等不动旧 doc
 *
 * 用法: node packages/server/scripts/migrate-add-agent-perms.js
 * 幂等: $addToSet + $nin 前置过滤, 多次跑不会重复添加
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const Position = require('@models/Position.model')

const AGENT_PERMS = ['agent.read', 'agent.write']

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-agent-perms] connected')

  // 给历史机构的 管理员/教务 加 agent.* 权限码
  // 限制 isSystem=true (系统职位), 避免误改 admin 自定义同名岗位
  const result = await Position.updateMany(
    {
      isSystem: true,
      name: { $in: ['管理员', '教务'] },
      permissions: { $nin: ['agent.read'] }
    },
    { $addToSet: { permissions: { $each: AGENT_PERMS } } }
  )
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-agent-perms] positions touched: ${result.modifiedCount} / matched: ${result.matchedCount}`)

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-agent-perms] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-add-agent-perms] failed:', e)
  process.exit(1)
})