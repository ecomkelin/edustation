'use strict'

/**
 * Jest beforeAll/afterAll/afterEach hooks.
 * 必须在 require 任何业务代码前 require 本文件.
 *
 *   require('./setup')
 *
 * 流程:
 *   1. 启动 mongodb-memory-server, 设 process.env.MONGODB_URI
 *   2. beforeAll mongoose.connect
 *   3. afterAll disconnect + stop mongo
 *
 * 注意: 故意不写 afterEach 清库. 测试用例自己负责按需创建数据 (避免跨用例污染,
 *   又能保留在 beforeAll 一次性建好的 fixture).
 *   需隔离的用例在 describe 内 beforeEach 重设 fixture.
 */

const { MongoMemoryServer } = require('mongodb-memory-server')

let mongo
let bootstrapped = false

async function bootstrap() {
  if (bootstrapped) return
  bootstrapped = true
  mongo = await MongoMemoryServer.create()
  process.env.MONGODB_URI = mongo.getUri()
  // eslint-disable-next-line no-console
  console.log('[setup] mongo-memory started, uri=', process.env.MONGODB_URI)
  const { connect } = require('@config/db')
  await connect()
}

beforeAll(async () => {
  await bootstrap()
}, 60000)

afterAll(async () => {
  try {
    const { disconnect } = require('@config/db')
    await disconnect()
  } catch (_) { /* ignore */ }
  if (mongo) {
    await mongo.stop()
    mongo = null
  }
  bootstrapped = false
}, 30000)