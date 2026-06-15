'use strict'

/**
 * 独立入口: 只跑 channel.seed, 不动其它数据
 *
 * 用法: node scripts/db/seed-channels.js
 * 幂等: 已存在则跳过, sort/isActive 差异会就地修正
 */
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { connect, disconnect } = require('@config/db')
const channelSeed = require('./seeds/channel.seed')

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[seed-channels] connected, running channel.seed...')
  await channelSeed.run()
  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[seed-channels] done.')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed-channels] failed:', e)
  process.exit(1)
})
