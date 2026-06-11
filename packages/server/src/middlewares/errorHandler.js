'use strict'

const ApiResponse = require('@utils/ApiResponse')
const ApiError = require('@utils/ApiError')
const { errorLog } = require('@utils/logger')
const config = require('@config/index')

/**
 * 统一错误出口。
 * 顺序：ApiError → Mongoose 校验 → duplicate key → 其他
 */
// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, _next) {
  let apiError
  if (err instanceof ApiError) {
    apiError = err
  } else if (err && err.name === 'ValidationError') {
    apiError = ApiError.badRequest(err.message)
  } else if (err && err.name === 'CastError') {
    apiError = ApiError.badRequest(`参数类型错误: ${err.path}`)
  } else if (err && err.code === 11000) {
    const field = Object.keys(err.keyValue || {})[0] || 'field'
    apiError = ApiError.conflict(`字段 ${field} 已存在`)
  } else {
    apiError = ApiError.internal(config.isProd ? '服务器内部错误' : err.message)
    errorLog(err, req)
  }

  res.status(apiError.statusCode).json(ApiResponse.error(apiError))
}
