'use strict'

const User = require('@models/User.model')
const RefreshToken = require('@models/RefreshToken.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const JwtUtil = require('@utils/JwtUtil')
const legalService = require('@modules/legal/legal.service')
const captchaService = require('@modules/captcha/captcha.service')
const config = require('@config/index')

// 自助资料可改字段白名单：mobile / passwordHash / isPlatformAdmin / isActive / isBlocked 一律不可由用户自助修改
const SELF_UPDATE_WHITELIST = ['realName', 'avatar', 'idCard', 'region']

const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * 登录：校验账号状态 + 密码 → 签 access + refresh → 写 refreshToken 入库。
 *
 * 错误信息按"账号是否存在 / 状态 / 密码"分桶返回,前端能区分提示
 * "账号不存在 / 账号已停用 / 账号已被禁用 / 密码错误"。
 * 4 种都是 401, 前端 http 拦截器对 /auth/login 的 401 单开 toast 通道(其他 401 仍走静默)。
 *
 * 性能/时序: 走一次 findOne + 一次 verify, 不存在时也走一次 verify 占位(用随机的 hash),
 * 避免"账号不存在" 比 "密码错" 快很多导致被枚举。
 *
 * 滑块验证 (2026-06):
 *  - 同一 mobile 失败 >= config.captcha.afterFailures 次后, 必传 captchaPass
 *  - controller 把 req.loginRateLimit 透传给本 service, 用于:
 *      · 读 failureCount 判定是否要滑块
 *      · 失败时 recordMobileFailure()
 *      · 成功时清桶(已由 controller 调 clearMobile)
 *
 * @returns {{ accessToken, user, refreshToken }}
 */
async function login({ mobile, password: plain, ip, userAgent, captchaPass, rateLimit }) {
  // 0) 滑块验证: 该 mobile 失败次数 >= afterFailures → 必传 captchaPass
  const failureCount = rateLimit && typeof rateLimit.getMobileFailureCount === 'function'
    ? rateLimit.getMobileFailureCount()
    : 0
  if (failureCount >= config.captcha.afterFailures) {
    if (!captchaPass || !captchaService.verifyPass(captchaPass)) {
      // 缺或无效: 抛 400 + reason='captcha_required', 前端据此弹滑块
      throw ApiError.badRequest('请完成滑块验证', { reason: 'captcha_required' })
    }
    // 验证通过, 烧掉这个 pass
    captchaService.consumePass(captchaPass)
  }

  // 1) 先按手机号查 (不挂 isActive / isBlocked, 用于区分具体原因)
  const user = await User.findOne({ mobile }).select('+passwordHash')

  // 占位 hash —— 账号不存在时也跑一次 verify, 让两种情况的耗时相近
  const DUMMY_HASH = '$argon2id$v=19$m=65536,t=3,p=4$ZHVtbXlzYWx0Zm9yYWNjb3VudG5vdGV4aXN0$0000000000000000000000000000000000000000000'

  if (!user) {
    // 账号不存在 —— 跑一次假 verify 平衡时序
    await password.verify(DUMMY_HASH, plain).catch(() => false)
    // 视为失败: 累计 failureCount (防枚举 + 后续弹滑块)
    if (rateLimit && typeof rateLimit.recordMobileFailure === 'function') {
      rateLimit.recordMobileFailure()
    }
    throw ApiError.unauthorized('账号不存在')
  }
  if (user.isBlocked) {
    await password.verify(user.passwordHash, plain).catch(() => false)
    if (rateLimit && typeof rateLimit.recordMobileFailure === 'function') {
      rateLimit.recordMobileFailure()
    }
    throw ApiError.unauthorized('账号已被禁用,请联系管理员')
  }
  if (!user.isActive) {
    await password.verify(user.passwordHash, plain).catch(() => false)
    if (rateLimit && typeof rateLimit.recordMobileFailure === 'function') {
      rateLimit.recordMobileFailure()
    }
    throw ApiError.unauthorized('账号已停用,请联系管理员')
  }

  // 2) 密码校验
  const ok = await password.verify(user.passwordHash, plain)
  if (!ok) {
    if (rateLimit && typeof rateLimit.recordMobileFailure === 'function') {
      rateLimit.recordMobileFailure()
    }
    throw ApiError.unauthorized('密码错误')
  }

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

  // 法律协议: 登录时只计算平台级 (此时尚未选择 org). 机构级在 /me 或下单时再算.
  // 任何异常都不应阻塞登录本身, 失败时返回空数组 (合规拦截在客户端 graceful 降级)
  let pendingConsents = []
  try {
    pendingConsents = await legalService.computePendingConsents({ userId: user._id, orgId: null })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[auth.login] computePendingConsents failed: ${e && e.message}`)
  }

  return {
    accessToken,
    refreshToken,
    user: publicUser(user),
    // 招生试听 (2026-06): 试听转化时为新家长设的初始密码 = mobile.slice(-6),
    // 首登后必须改密 (User.requirePasswordChange=true). 前端拦截器据此
    // 跳到 /reset-password?initial=1 强制改密.
    requirePasswordChange: !!user.requirePasswordChange,
    // 法律协议 (2026-06): 平台级未对齐版本的协议清单. 前端 router guard 据此拦到 /agreement/accept
    pendingConsents
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
 *
 * 2026-06: 加 pendingConsents 字段, controller 透传 req.orgId 让 service 算"该机构内
 * 也需重新同意"的协议. 未传 orgId 时只算平台级.
 */
async function me(userId, options = {}) {
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

  // 平台超管无 UserOrgRel, 但业务上要看所有机构; 给他"虚拟"机构列表 = 全系统机构
  // 列表项不带 positions (平台超管天然拥有所有权限, 走 requirePermission 的 isPlatformAdmin 短路)
  let orgs = rels.map((r) => ({
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

  if (user.isPlatformAdmin && orgs.length === 0) {
    const Org = require('@models/Org.model')
    const allOrgs = await Org.find({ isActive: true }).select('name type isActive').sort({ createdAt: 1 }).lean()
    orgs = allOrgs.map((o, i) => ({
      id: String(o._id),
      name: o.name,
      type: o.type,
      isActive: o.isActive,
      isMain: i === 0, // 第一个默认选中
      positions: []
    }))
  }

  // 法律协议: 当前 orgId (来自 x-org-id) 决定机构级协议是否纳入计算
  let pendingConsents = []
  try {
    pendingConsents = await legalService.computePendingConsents({
      userId,
      orgId: options.orgId || null
    })
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(`[auth.me] computePendingConsents failed: ${e && e.message}`)
  }

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
    orgs,
    // 法律协议 (2026-06): 当前用户在当前 org 下需要重新同意的协议清单
    pendingConsents
  }
}

/**
 * 自助修改资料：白名单字段(realName / avatar / idCard / region)。
 * - mobile / passwordHash / isPlatformAdmin / isActive / isBlocked 一律由管理员走 user 模块改。
 * - idCard 唯一性手动校验(与 user.update 等价,避免 partial index 异常回包不友好)。
 * - avatar 是 File 引用字段(走 URL 字符串),引用追踪由 fileBind 维护,这里必须调
 *   diffSingle,否则新上传的头像永远是孤儿、引用数 = 0(详见 user.service.update)。
 * - 完成后回包用 me(userId) 的全量结构,与 GET /auth/me 完全一致,前端可以直接覆盖。
 */
async function updateMe(userId, payload, options = {}) {
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

  // avatar 是 File 引用字段 —— 先抓旧值,update 完做 diffSingle(unbind 旧 / bind 新)
  let prevAvatar = null
  if (Object.prototype.hasOwnProperty.call(patch, 'avatar')) {
    const prev = await User.findById(userId).select('avatar').lean()
    prevAvatar = prev ? prev.avatar : null
  }

  const user = await User.findByIdAndUpdate(userId, { $set: patch }, { new: true, runValidators: true })
    .select('_id avatar')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')

  // avatar 引用追踪 —— 与 user.service.update 行为一致
  if (Object.prototype.hasOwnProperty.call(patch, 'avatar')) {
    const { REF_ENTITY } = require('@models/File.model')
    const fileBind = require('@modules/storage/fileBind')
    await fileBind.diffSingle({
      orgId: null, // user 跨机构,avatar scope 允许 File.org=null
      oldUrl: prevAvatar,
      newUrl: user.avatar,
      entity: REF_ENTITY.USER,
      entityId: user._id,
      field: 'avatar'
    })
  }

  return me(userId, { orgId: options.orgId || null })
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
