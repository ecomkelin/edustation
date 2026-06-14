'use strict'

const User = require('@models/User.model')
const RefreshToken = require('@models/RefreshToken.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const JwtUtil = require('@utils/JwtUtil')

// 自助资料可改字段白名单：mobile / passwordHash / isPlatformAdmin / isActive / isBlocked 一律不可由用户自助修改
const SELF_UPDATE_WHITELIST = ['realName', 'avatar', 'idCard', 'region']

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 登录：校验密码 → 签 access + refresh → 写 refreshToken 入库。
 * @returns {{ accessToken, user, refreshToken }}
 */
async function login({ mobile, password: plain, ip, userAgent }) {
  const user = await User.findOne({ mobile, isActive: true, isBlocked: { $ne: true } }).select('+passwordHash')
  if (!user) throw ApiError.unauthorized('账号或密码错误')

  const ok = await password.verify(user.passwordHash, plain)
  if (!ok) throw ApiError.unauthorized('账号或密码错误')

  const accessToken = JwtUtil.signAccessToken({ userId: String(user._id) })
  const refreshToken = JwtUtil.signRefreshToken({ userId: String(user._id), jti: Date.now() + Math.random() })

  // 入库 refresh token (sha256)
  await RefreshToken.create({
    user: user._id,
    tokenHash: JwtUtil.hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: userAgent || '',
    ip: ip || ''
  })

  return {
    accessToken,
    refreshToken,
    user: publicUser(user),
    // 招生试听 (2026-06): 试听转化时为新家长设的初始密码 = mobile.slice(-6),
    // 首登后必须改密 (User.requirePasswordChange=true). 前端拦截器据此
    // 跳到 /reset-password?initial=1 强制改密.
    requirePasswordChange: !!user.requirePasswordChange
  }
}

/**
 * 刷新：读 cookie 里的 refresh token → 校验 + 未撤销 → 轮换（旧 token 撤销，签新 token）
 * @returns {{ accessToken, refreshToken }}
 */
async function refresh({ refreshToken, ip, userAgent }) {
  if (!refreshToken) throw ApiError.unauthorized('缺少 refresh token')

  let payload
  try {
    payload = JwtUtil.verifyRefreshToken(refreshToken)
  } catch (e) {
    throw ApiError.unauthorized('refresh token 无效或已过期')
  }

  const tokenHash = JwtUtil.hashToken(refreshToken)
  const record = await RefreshToken.findOne({ tokenHash })
  if (!record || record.isRevoked) {
    throw ApiError.unauthorized('refresh token 已失效')
  }

  // 检查 user 仍激活（包含 isBlocked 校验）
  const user = await User.findById(payload.userId).select('isActive isPlatformAdmin isBlocked')
  if (!user || !user.isActive || user.isBlocked) throw ApiError.unauthorized('账号已停用或被禁用')

  // 轮换：旧 token 撤销
  record.isRevoked = true
  await record.save()

  // 签新 token
  const newAccess = JwtUtil.signAccessToken({ userId: String(user._id) })
  const newRefresh = JwtUtil.signRefreshToken({ userId: String(user._id), jti: Date.now() + Math.random() })
  await RefreshToken.create({
    user: user._id,
    tokenHash: JwtUtil.hashToken(newRefresh),
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    userAgent: userAgent || '',
    ip: ip || ''
  })

  return { accessToken: newAccess, refreshToken: newRefresh }
}

/**
 * 登出：撤销当前 refresh token
 */
async function logout({ refreshToken }) {
  if (!refreshToken) return { success: true }
  const tokenHash = JwtUtil.hashToken(refreshToken)
  await RefreshToken.updateOne({ tokenHash }, { $set: { isRevoked: true } })
  return { success: true }
}

/**
 * 当前用户信息（含用户的所有 org + 职位聚合权限）
 *
 * 个人中心(Profile) 页同时复用这个出参 —— 因此把 idCard / region 一并附上,
 * 现有调用方(auth store 的 fetchMe)只是多拿到几个字段,纯加性,不破兼容。
 */
async function me(userId) {
  const user = await User.findById(userId)
    .select('mobile realName avatar idCard region isPlatformAdmin isActive isBlocked blockedAt blockedReason createdAt')
    .populate('region', 'name level code')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')

  const rels = await UserOrgRel.find({ user: userId })
    .populate({
      path: 'org',
      select: 'name type isActive'
    })
    .populate({
      path: 'positions',
      select: 'name permissions isSystem',
      populate: { path: 'permissions' }
    })
    .lean()

  const orgs = rels.map((r) => ({
    id: String(r.org._id),
    name: r.org.name,
    type: r.org.type,
    isActive: r.org.isActive,
    isMain: r.isMain,
    positions: (r.positions || []).map((p) => ({
      id: String(p._id),
      name: p.name,
      permissions: p.permissions,
      isSystem: p.isSystem
    }))
  }))

  return {
    id: String(user._id),
    mobile: user.mobile,
    realName: user.realName,
    avatar: user.avatar,
    idCard: user.idCard || null,
    region: user.region
      ? { id: String(user.region._id), name: user.region.name, level: user.region.level, code: user.region.code }
      : null,
    isPlatformAdmin: user.isPlatformAdmin,
    isActive: user.isActive,
    isBlocked: !!user.isBlocked,
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    createdAt: user.createdAt,
    orgs
  }
}

/**
 * 自助修改资料：白名单字段(realName / avatar / idCard / region)。
 * - mobile / passwordHash / isPlatformAdmin / isActive / isBlocked 一律由管理员走 user 模块改。
 * - idCard 唯一性手动校验(与 user.update 等价,避免 partial index 异常回包不友好)。
 * - 完成后回包用 me(userId) 的全量结构,与 GET /auth/me 完全一致,前端可以直接覆盖。
 */
async function updateMe(userId, payload) {
  const patch = {}
  for (const key of SELF_UPDATE_WHITELIST) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      // 空串 / undefined 一律视为"清空",对应字段置 null(idCard / region / avatar 允许为空)
      const v = payload[key]
      patch[key] = v === '' || v === undefined ? null : v
    }
  }

  if (patch.idCard) {
    const dup = await User.findOne({ idCard: patch.idCard, _id: { $ne: userId } }).select('_id').lean()
    if (dup) throw ApiError.conflict('身份证号已存在')
  }

  const user = await User.findByIdAndUpdate(userId, { $set: patch }, { new: true, runValidators: true })
    .select('_id')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')
  return me(userId)
}

/**
 * 自助修改密码：原密码 + 新密码;同步把当前用户的所有 refresh token 撤销,
 * 防止"已泄漏的旧密码 + 旧 refresh token"继续生效。
 * 当次请求的 access token 等其自然过期即可(短有效期)。
 */
async function changePassword(userId, oldPassword, newPassword) {
  if (oldPassword === newPassword) throw ApiError.badRequest('新密码不能与原密码相同')
  const user = await User.findById(userId).select('+passwordHash')
  if (!user) throw ApiError.notFound('用户不存在')
  const ok = await password.verify(user.passwordHash, oldPassword)
  if (!ok) throw ApiError.badRequest('原密码错误')
  user.passwordHash = await password.hash(newPassword)
  // 招生试听 (2026-06): 改密成功即清掉首登强改标志
  if (user.requirePasswordChange) {
    user.requirePasswordChange = false
  }
  await user.save()
  // 把所有未撤销的 refresh token 一律撤销 —— 强制其他设备重新登录
  await RefreshToken.updateMany({ user: userId, isRevoked: false }, { $set: { isRevoked: true } })
  return { success: true }
}

function publicUser(u) {
  return {
    id: String(u._id),
    mobile: u.mobile,
    realName: u.realName,
    avatar: u.avatar,
    isPlatformAdmin: u.isPlatformAdmin,
    isActive: u.isActive,
    isBlocked: !!u.isBlocked,
    blockedAt: u.blockedAt,
    blockedReason: u.blockedReason,
    // 招生试听 (2026-06): 首登强改密标志; 前端拦截器据此跳 /reset-password?initial=1
    requirePasswordChange: !!u.requirePasswordChange
  }
}

module.exports = { login, refresh, logout, me, updateMe, changePassword, publicUser }
