'use strict'

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const { connect, disconnect } = require('@config/db')
const { initSeeds } = require('./init-seeds')

async function main() {
  // eslint-disable-next-line no-console
  console.log('[seed] starting...')
  await connect()
  // eslint-disable-next-line no-console
  console.log('[seed] connected to MongoDB')

  await initSeeds()

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[seed] done. exit.')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[seed] failed:', e)
  process.exit(1)
})
