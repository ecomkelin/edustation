'use strict'

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { connect, disconnect } = require('@config/db')
const { initSeeds } = require('./init-seeds')

async function main() {
  // 2026-07-14: --force flag 拆 db:seed:safe (默认) vs db:seed:nuke (--force 显式声明)
  // 默认 safe 模式: 跑 idempotent seeds; 跳 dropDatabase; 安全可重跑
  // --force 模式:   额外跑 initial.seed.js (dropDatabase + 22+ collection 重灌), 不可逆
  const force = process.argv.includes('--force')
  // eslint-disable-next-line no-console
  console.log(`[seed] starting (mode=${force ? 'NUKE --force' : 'safe'})`)
  await connect()
  // eslint-disable-next-line no-console
  console.log('[seed] connected to MongoDB')

  if (force) {
    // eslint-disable-next-line no-console
    console.warn('⚠️  NUKE mode: dropDatabase + full re-seed, this is IRREVERSIBLE')
  }

  await initSeeds({ force })

  await disconnect()
  // eslint-disable-next-line no-console
  console.log(`[seed] done (mode=${force ? 'NUKE' : 'safe'}). exit.`)
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', e)
  process.exit(1)
})
