'use strict'

const ApiError = require('@utils/ApiError')
const JwtUtil = require('@utils/JwtUtil')
const User = require('@models/User.model')

/**
 * 解析 Bearer Token，校验后挂载 req.user。
 *
 * 失败一律 throw ApiError(401)。
 */
module.exports = async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthorized('请先登录')
    }

    let payload
    try {
      payload = JwtUtil.verifyAccessToken(token)
    } catch (e) {
      throw ApiError.unauthorized('令牌无效或已过期')
    }

    const user = await User.findById(payload.userId)
      .select('mobile realName avatar isPlatformAdmin isActive')
      .lean()
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('账号不存在或已停用')
    }

    req.user = {
      id: String(user._id),
      mobile: user.mobile,
      realName: user.realName,
      avatar: user.avatar,
      isPlatformAdmin: !!user.isPlatformAdmin
    }
    next()
  } catch (e) {
    next(e)
  }
}
