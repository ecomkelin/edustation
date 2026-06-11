'use strict'

/**
 * 业务错误类。Controller 抛 ApiError，errorHandler 中间件统一捕获。
 */
class ApiError extends Error {
  /**
   * @param {number} statusCode HTTP 状态码
   * @param {string} message 错误信息
   * @param {object} [data] 附加数据
   */
  constructor(statusCode, message, data = null) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = statusCode
    this.data = data
    this.expose = true
  }

  static badRequest(message = '请求参数错误', data) {
    return new ApiError(400, message, data)
  }

  static unauthorized(message = '未授权', data) {
    return new ApiError(401, message, data)
  }

  static forbidden(message = '无权限', data) {
    return new ApiError(403, message, data)
  }

  static notFound(message = '资源不存在', data) {
    return new ApiError(404, message, data)
  }

  static conflict(message = '资源冲突', data) {
    return new ApiError(409, message, data)
  }

  static unprocessable(message = '无法处理', data) {
    return new ApiError(422, message, data)
  }

  static internal(message = '服务器内部错误') {
    return new ApiError(500, message)
  }
}

module.exports = ApiError
