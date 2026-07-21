'use strict'

const ApiError = require('@utils/ApiError')
const JwtUtil = require('@utils/JwtUtil')
const User = require('@models/User.model')
const { DEFAULT_USER_AVATAR_KEY } = require('@shared/avatars')

/** 从 header 或 query 抽 Bearer token (供 stream 这类 iframe 端点用) */
function extractToken(req) {
  const header = req.headers.authorization || ''
  const [scheme, headerToken] = header.split(' ')
  if (scheme === 'Bearer' && headerToken) return { token: headerToken, via: 'header' }
  const queryToken = (req.query && req.query.access_token) || ''
  if (queryToken) return { token: queryToken, via: 'query' }
  return { token: '', via: '' }
}

/**
 * 解析 Bearer Token，校验后挂载 req.user。
 *
 * 失败一律 throw ApiError(401)。
 */
module.exports = async function authenticate(req, res, next) {
  try {
    const { token, via } = extractToken(req)
    if (!token) {
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
    // iframe 端点可能通过 query 传 token —— 一次性提示运维存在「token in URL」风险
    if (via === 'query') {
      // eslint-disable-next-line no-console
      console.warn('[auth] access_token via query (iframe/stream path). Consider short-lived signed URLs in production.')
    }
    next()
  } catch (e) {
    next(e)
  }
}
