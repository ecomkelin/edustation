'use strict'

const ApiError = require('@utils/ApiError')

/**
 * 校验当前用户是否为平台超管。
 * 必须在 authenticate 之后使用（依赖 req.user.isPlatformAdmin）。
 *
 * 用途：跨机构同步等"平台级"操作的硬门槛。
 *   - 平台超管：通过
 *   - 其他人：403
 */
module.exports = function requirePlatformAdmin(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized())
  if (!req.user.isPlatformAdmin) {
    return next(ApiError.forbidden('仅平台超管可执行该操作'))
  }
  next()
}
