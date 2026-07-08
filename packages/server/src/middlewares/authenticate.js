'use strict'

const ApiError = require('@utils/ApiError')
const JwtUtil = require('@utils/JwtUtil')
const User = require('@models/User.model')
const { DEFAULT_USER_AVATAR_KEY } = require('@shared/avatars')

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
      .select('mobile realName avatarSvgKey isPlatformAdmin isActive')
      .lean()
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('账号不存在或已停用')
    }

    req.user = {
      id: String(user._id),
      // 2026-07-08: 业务侧 service 一律用 actor.userId (e.g. task.service / order.service),
      //   authenticate 之前只设 id → actor.userId 永远是 undefined, 所有写操作 (author/reviewer/doneBy) 必崩.
      //   同步加 userId 字段, service 端零修改.
      userId: String(user._id),
      mobile: user.mobile,
      realName: user.realName,
      avatarSvgKey: user.avatarSvgKey || DEFAULT_USER_AVATAR_KEY,
      isPlatformAdmin: !!user.isPlatformAdmin
    }
    next()
  } catch (e) {
    next(e)
  }
}
