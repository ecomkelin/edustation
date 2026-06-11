'use strict'

const ApiError = require('@utils/ApiError')

/**
 * 破坏性操作门控:超管 + 操作密码二次确认。
 *
 * 用法(放在 router.delete 上):
 *   router.delete('/:id', mws.requirePlatformPassword, asyncHandler(c.remove))
 *
 * 行为:
 *   1) 必须是平台超管(req.user.isPlatformAdmin) —— 防御第一道
 *   2) body.password 必填 —— 防"账号被人借用"
 *   3) 走与登录一致的 argon2.verify,对照 req.user 自己的 passwordHash
 *
 * 失败响应:
 *   - 非超管      → 403
 *   - 缺密码      → 400
 *   - 账号失效    → 401
 *   - 密码错误    → 401
 *
 * 关联数据预检(业务上"无关联才能删")由各 service.remove 自己负责,
 * 本中间件只管身份/密码,不做业务校验 —— 方便复用 + 单一职责。
 *
 * 注意:必须挂在 authenticate 之后(依赖 req.user.id / req.user.isPlatformAdmin)。
 */
module.exports = async function requirePlatformPassword(req, res, next) {
  try {
    if (!req.user) return next(ApiError.unauthorized())
    if (!req.user.isPlatformAdmin) {
      return next(ApiError.forbidden('仅平台超管可执行该操作'))
    }
    const pwd = req.body && req.body.password
    if (!pwd || !String(pwd).trim()) {
      return next(ApiError.badRequest('请输入操作密码以确认'))
    }
    const User = require('@models/User.model')
    const password = require('@utils/password')
    const user = await User.findOne({ _id: req.user.id, isActive: true }).select('+passwordHash')
    if (!user) return next(ApiError.unauthorized('账号不存在或已停用'))
    const ok = await password.verify(user.passwordHash, String(pwd))
    if (!ok) return next(ApiError.unauthorized('操作密码错误'))
    next()
  } catch (e) {
    next(e)
  }
}
