'use strict'

const User = require('@models/User.model')
const RefreshToken = require('@models/RefreshToken.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const JwtUtil = require('@utils/JwtUtil')

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
    user: publicUser(user)
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
 */
async function me(userId) {
  const user = await User.findById(userId)
    .select('mobile realName avatar isPlatformAdmin isActive isBlocked blockedAt blockedReason createdAt')
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
    isPlatformAdmin: user.isPlatformAdmin,
    isActive: user.isActive,
    isBlocked: !!user.isBlocked,
    blockedAt: user.blockedAt,
    blockedReason: user.blockedReason,
    orgs
  }
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
    blockedReason: u.blockedReason
  }
}

module.exports = { login, refresh, logout, me, publicUser }
