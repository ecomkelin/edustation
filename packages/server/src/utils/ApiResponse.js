'use strict'

/**
 * 统一响应包装。所有 controller 的成功返回值走这里。
 *
 * 约定: { success, code, message, data }
 *  - code: HTTP 风格数字 (200/201/400/401/403/404/409/422/500)
 *  - success: boolean
 *  - data: 业务负载
 */
class ApiResponse {
  constructor({ success = true, code = 200, message = 'OK', data = null } = {}) {
    this.success = success
    this.code = code
    this.message = message
    this.data = data
  }

  static ok(data = null, message = 'OK') {
    return new ApiResponse({ success: true, code: 200, message, data })
  }

  static created(data = null, message = '已创建') {
    return new ApiResponse({ success: true, code: 201, message, data })
  }

  static fail(message = '请求失败', code = 400, data = null) {
    return new ApiResponse({ success: false, code, message, data })
  }

  static error(err) {
    const code = err && typeof err.code === 'number' ? err.code : 500
    const message = err && err.message ? err.message : '服务器内部错误'
    return new ApiResponse({ success: false, code, message, data: err && err.data ? err.data : null })
  }
}

module.exports = ApiResponse
