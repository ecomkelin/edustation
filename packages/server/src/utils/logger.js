'use strict'

const morgan = require('morgan')
const config = require('@config/index')

/**
 * morgan 格式：method url status :res[content-length] - :response-time ms ":req[X-Request-Id]"
 */
const requestLogger = morgan(
  (tokens, req, res) => {
    return [
      tokens.method(req, res),
      tokens.url(req, res),
      tokens.status(req, res),
      tokens.res(req, res, 'content-length'),
      '-',
      tokens['response-time'](req, res),
      'ms',
      `"${req.id || '-'}"`,
      `"${req.user ? req.user.id : 'guest'}"`
    ].join(' ')
  },
  {
    skip: () => config.isTest
  }
)

/**
 * 简单错误日志（写到 stderr）
 */
function errorLog(err, req) {
  const meta = {
    requestId: req && req.id,
    method: req && req.method,
    url: req && req.originalUrl,
    userId: req && req.user && req.user.id
  }
  // eslint-disable-next-line no-console
  console.error('[error]', err && err.stack ? err.stack : err, meta)
}

module.exports = { requestLogger, errorLog }
