'use strict'

const ApiResponse = require('@utils/ApiResponse')

/**
 * 404 兜底，仅匹配 /api 前缀。
 */
module.exports = function notFound(req, res) {
  res.status(404).json(ApiResponse.fail(`Route not found: ${req.method} ${req.originalUrl}`, 404))
}
