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
 * requirePasswordChange 强制改密白名单路径 (审计 H3 2026-08-05)
 * 凡 user.requirePasswordChange===true → 仅允许这两个端点,
 * 其他一律 403 require_password_change, 前端据此跳改密页.
 */
const PASSWORD_CHANGE_WHITELIST = new Set([
  '/api/v1/auth/change-password',
  '/api/v1/auth/me'
])

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

    // 2026-08-05: select 加 isBlocked + requirePasswordChange (审计 H3/M11)
    //   isBlocked 检查与 refresh 路径对齐 (auth.service.js 148-149)
    //   requirePasswordChange 强制改密门 — 服务端校验, 不依赖前端拦截
    const user = await User.findById(payload.userId)
      .select('mobile realName avatarSvgKey isPlatformAdmin isActive isBlocked requirePasswordChange')
      .lean()
    if (!user || !user.isActive) {
      throw ApiError.unauthorized('账号不存在或已停用')
    }
    if (user.isBlocked) {
      throw ApiError.unauthorized('账号已被禁用')
    }

    // 2026-08-05: requirePasswordChange 强制改密门 (审计 H3)
    //   试听转化建的家长账号 requirePasswordChange=true, 初始密码=手机号后6位高度可猜.
    //   强制改密必须服务端守门 — 仅放行 /auth/change-password 与 /auth/me, 其他一律 403.
    if (user.requirePasswordChange === true) {
      const path = (req.originalUrl || req.url || '').split('?')[0]
      if (!PASSWORD_CHANGE_WHITELIST.has(path)) {
        // eslint-disable-next-line no-console
        console.warn(`[auth] requirePasswordChange blocked path=${path} user=${user._id}`)
        return next(ApiError.forbidden('请先修改初始密码', { code: 'require_password_change' }))
      }
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
