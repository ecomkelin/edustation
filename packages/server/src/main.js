'use strict'

// 必须在最顶部：注册 module-alias
require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const config = require('@config/index')
const { connect } = require('@config/db')
const { createApp } = require('./app')

async function bootstrap() {
  // 1. 数据库
  await connect()
  // eslint-disable-next-line no-console
  console.log(`[mongo] connected to ${config.db.uri.replace(/\/\/[^@]+@/, '//***@')}`)

  // 2. Express
  const app = createApp()

  // 3. 启动监听 (test 环境不 listen)
  if (!config.isTest) {
    const server = app.listen(config.port, () => {
      // eslint-disable-next-line no-console
      console.log(`[server] listening on http://localhost:${config.port} (${config.env})`)
    })

    const shutdown = async (sig) => {
      // eslint-disable-next-line no-console
      console.log(`[server] received ${sig}, shutting down...`)
      server.close()
      try {
        await require('@config/db').disconnect()
      } catch (_) {
        /* ignore */
      }
      process.exit(0)
    }
    process.on('SIGINT', () => shutdown('SIGINT'))
    process.on('SIGTERM', () => shutdown('SIGTERM'))
  }

  // 4. 导出供测试
  return app
}

bootstrap().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[server] bootstrap failed:', e)
  process.exit(1)
})
