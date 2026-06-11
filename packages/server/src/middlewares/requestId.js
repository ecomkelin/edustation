'use strict'

const { v4: uuidv4 } = require('uuid')

/**
 * 给每条请求加 X-Request-Id。
 */
module.exports = function requestId(req, res, next) {
  const incoming = req.headers['x-request-id']
  req.id = (typeof incoming === 'string' && incoming.length <= 100 && incoming) || uuidv4()
  res.setHeader('X-Request-Id', req.id)
  next()
}
