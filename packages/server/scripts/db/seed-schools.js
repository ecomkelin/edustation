'use strict'

/**
 * 独立入口: 只跑 school.seed, 不动其它数据
 *
 * 用法: node scripts/db/seed-schools.js
 * 幂等: 已存在则跳过; '东风' 会原地改名为 '东风幼儿园'
 */
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { connect, disconnect } = require('@config/db')
const schoolSeed = require('./seeds/school.seed')

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[seed-schools] connected, running school.seed...')
  await schoolSeed.run()
  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[seed-schools] done.')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed-schools] failed:', e)
  process.exit(1)
})
