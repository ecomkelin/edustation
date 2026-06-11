'use strict'

const mongoose = require('mongoose')
const config = require('@config/index')

mongoose.set('strictQuery', true)

/**
 * 连接 MongoDB。
 * @returns {Promise<typeof mongoose>}
 */
async function connect() {
  if (!config.db.uri) {
    throw new Error('MONGODB_URI is not set')
  }
  await mongoose.connect(config.db.uri, config.db.options)
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
