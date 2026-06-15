'use strict'

/**
 * 独立入口: 只跑 leadTag.seed, 不动其它数据
 *
 * 用法: node scripts/db/seed-lead-tags.js
 * 幂等: 已存在则跳过, sort/isActive 差异会就地修正
 */
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { connect, disconnect } = require('@config/db')
const leadTagSeed = require('./seeds/leadTag.seed')

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[seed-lead-tags] connected, running leadTag.seed...')
  await leadTagSeed.run()
  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[seed-lead-tags] done.')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed-lead-tags] failed:', e)
  process.exit(1)
})
