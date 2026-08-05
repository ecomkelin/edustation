'use strict'

const mongoose = require('mongoose')

// 测试环境 (jest): config/index 可能已被 helpers 链 require 过, db.uri 锁为 placeholder.
//   此时 setup.js beforeAll 已注入真 mongo-memory URI, 需要动态读 env.
//   其他环境: 正常 require config (config.db.uri 在 export 时求值一次即可).
const config = process.env.NODE_ENV === 'test'
  ? { db: { uri: process.env.MONGODB_URI, options: { serverSelectionTimeoutMS: 5000 } } }
  : require('@config/index')

mongoose.set('strictQuery', true)

/**
 * 连接 MongoDB。
 * @returns {Promise<typeof mongoose>}
 */
async function connect() {
  const uri = process.env.NODE_ENV === 'test' ? process.env.MONGODB_URI : config.db.uri
  if (!uri) {
    throw new Error('MONGODB_URI is not set')
  }
  await mongoose.connect(uri, config.db.options)
  return mongoose
}

async function disconnect() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect()
  }
}

/**
 * @returns {Promise<'connected'|'disconnected'|'connecting'|'disconnecting'>}
 */
function status() {
  const map = ['disconnected', 'connected', 'connecting', 'disconnecting']
  return Promise.resolve(map[mongoose.connection.readyState] || 'unknown')
}

module.exports = { connect, disconnect, status, mongoose }
