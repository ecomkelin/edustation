'use strict'

/**
 * 微信小程序登录 / 绑定 / 自助注册 (2026-08)
 *
 * 三条路径, 全部复用 auth.service.issueTokens 签发 token:
 *   - wxLogin  (老用户静默)   wx.login 的 code → openid → 已绑定发 token, 否则 need_bind
 *   - wxBind   (新用户绑定)   loginCode + phoneCode → openid + 手机号
 *                            → 命中已有 User 则绑微信身份; 未命中且 scene 有效 orgId 则自助注册
 *   - wxRefresh 由 controller 直接复用 auth.service.refresh (本文件不实现)
 *
 * 关联桥梁: 微信手机号 (getuserphonenumber 后端换号) ↔ User.mobile
 *
 * 安全:
 *   - 手机号一律后端向微信换取, 永不信任客户端明文
 *   - 防劫持: openid 已绑在别的 mobile 上 → 409 拒绝
 *   - 自助注册的 User 用随机密码占位 (微信用户不走密码登录), requirePasswordChange=false
 *
 * 复用现有范式:
 *   - 家长账号创建镜像 trialBooking.service.js 的 convert() (User + UserOrgRel 家长位 + Parent)
 *   - 「微信自助注册」渠道走 Category(model='Channel') find-or-create (per-org 字典)
 *
 * scene 编码 (P0):  直读 24hex orgId (或 'o=<orgId>'), 不带 inviter 归因。
 * P1 升级为 InviteCode 短码 → { orgId, inviter }, 届时改 resolveScene 即可。
 */

const crypto = require('crypto')

const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Position = require('@models/Position.model')
const Parent = require('@models/Parent.model')
const Category = require('@models/Category.model')
const Org = require('@models/Org.model')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const wechat = require('@utils/wechat')
const authService = require('./auth.service')

const { issueTokens, publicUser, computeUserOrgs } = authService

// ─── 内部辅助 ───

function assertUserLoggable(user) {
  if (user.isBlocked) throw ApiError.unauthorized('账号已被禁用,请联系管理员')
  if (!user.isActive) throw ApiError.unauthorized('账号已停用,请联系管理员')
}

/**
 * 按 openid 找已绑定 User。
 */
async function findUserByWx(openid) {
  if (!openid) return null
  return User.findOne({ wechatOpenId: openid })
}

/**
 * 解析小程序码 scene → { orgId, inviter }。
 * P0 只支持 24hex orgId (直读或 'o=<orgId>'); P1 接 InviteCode 短码后扩展。
 */
function resolveScene(scene) {
  if (!scene) return null
  const decoded = decodeURIComponent(scene).trim()
  let orgId = null
  const m = decoded.match(/^o=([a-fA-F0-9]{24})$/)
  if (m) {
    orgId = m[1]
  } else if (/^[a-fA-F0-9]{24}$/.test(decoded)) {
    orgId = decoded
  }
  // P0 不带 inviter (scene 32 字节塞不下 orgId+staffId); P1 短码方案再补
  return orgId ? { orgId, inviter: null } : null
}

/**
 * find-or-create 「微信自助注册」招生渠道 (Category model='Channel')。
 * per-org 字典, 按 code 查找; 并发/同名冲突时重新查。
 */
async function findOrCreateSelfRegisterChannel(orgId) {
  const filter = { org: orgId, model: 'Channel', code: 'wechat_self_register' }
  const existing = await Category.findOne(filter).select('_id').lean()
  if (existing) return existing._id
  try {
    const created = await Category.create({
      org: orgId,
      model: 'Channel',
      name: '微信自助注册',
      code: 'wechat_self_register',
      level: 0
    })
    return created._id
  } catch (e) {
    // 并发或 name 唯一约束冲突 → 重新查
    const again = await Category.findOne(filter).select('_id').lean()
    if (again) return again._id
    throw e
  }
}

/**
 * 自助注册新家长 (镜像 trialBooking.service.js convert() Step 3-5):
 *   1. User.create (随机密码占位, requirePasswordChange=false)
 *   2. UserOrgRel upsert 挂「家长」Position
 *   3. Parent upsert 业务档案 (来源「微信自助注册」, inviter 归因)
 *
 * 幂等: User mobile unique / UserOrgRel (user,org) unique / Parent (org,phone) unique,
 *       同一手机号重扫不会产生重复数据。
 */
async function registerSelf({ mobile, openid, orgId, inviter }) {
  // 1) User
  const randomHash = await password.hash(crypto.randomBytes(32).toString('hex'))
  let user
  try {
    user = await User.create({
      mobile,
      passwordHash: randomHash,
      realName: '家长',
      wechatOpenId: openid,
      requirePasswordChange: false,
      isActive: true
    })
  } catch (e) {
    // 并发: 同 mobile 刚被另一请求建 (例如同机构同号重扫)
    if (e.code === 11000) {
      user = await User.findOne({ mobile })
      if (!user) throw e
      // 补绑微信身份
      user.wechatOpenId = openid
      await user.save()
    } else {
      throw e
    }
  }

  // 2) UserOrgRel 挂「家长」Position
  const parentPos = await Position.findOne({ org: orgId, name: '家长' }).select('_id').lean()
  if (!parentPos) {
    throw ApiError.unprocessable('机构未初始化「家长」职位,无法完成注册')
  }
  await UserOrgRel.findOneAndUpdate(
    { user: user._id, org: orgId },
    { $setOnInsert: { user: user._id, org: orgId, positions: [parentPos._id], isMain: true } },
    { upsert: true, new: true }
  )

  // 3) Parent 业务档案 (来源「微信自助注册」, inviter 归因)
  const channelId = await findOrCreateSelfRegisterChannel(orgId)
  await Parent.findOneAndUpdate(
    { org: orgId, phone: mobile },
    {
      $setOnInsert: {
        org: orgId,
        phone: mobile,
        source: channelId,
        promoteBy: inviter || null,
        user: user._id,
        createdBy: inviter || null,
        lifecycle: 'new'
      }
    },
    { upsert: true, new: true }
  )

  return user
}

// ─── 对外接口 ───

/**
 * 微信静默登录 (老用户)。
 * 已绑定 openid → 发 token; 否则返回 need_bind 让前端走手机号绑定。
 *
 * 2026-08-05: 与 /auth/login 同源校验 — 没有机构 + 非超管 → 抛 403,
 * 响应带回 orgs, 前端 _consumeWxTokens 不再二次 fetchMe
 */
async function wxLogin({ code, ip, userAgent }) {
  const { openid } = await wechat.jscode2session(code)
  if (!openid) throw ApiError.badRequest('微信登录失败:未拿到 openid')

  const user = await findUserByWx(openid)
  if (!user) {
    return { status: 'need_bind' }
  }
  assertUserLoggable(user)

  const orgs = await computeUserOrgs(user)
  if (orgs.length === 0 && !user.isPlatformAdmin) {
    // eslint-disable-next-line no-console
    console.warn(`[auth.wxLogin] user has no orgs, reject: ${user._id} openid=${openid}`)
    throw ApiError.forbidden('账号未关联任何机构,请联系管理员')
  }

  const { accessToken, refreshToken } = await issueTokens(user, { ip, userAgent })
  return { status: 'bound', accessToken, refreshToken, user: publicUser(user), orgs }
}

/**
 * 微信绑定 / 自助注册 (新用户)。
 * loginCode + phoneCode → 微信身份 + 手机号 → 绑定已有账号 or 自助注册。
 *
 * 2026-08-05: 与 /auth/login 同源 — 响应带回 orgs, 前端 _consumeWxTokens 不再二次 fetchMe。
 * registerSelf 已经挂好 UserOrgRel (家长位), 所以 wxBind 路径不可能落到 "无机构" 分支;
 * 但命中已有账号 (如试听转化建的家长) 的分支仍然要走同源校验, 防止孤儿账号登录。
 */
async function wxBind({ loginCode, phoneCode, scene, ip, userAgent }) {
  // 1) 换微信身份 + 手机号 (后端换取, 不信任客户端明文)
  const { openid } = await wechat.jscode2session(loginCode)
  if (!openid) throw ApiError.badRequest('微信登录失败:未拿到 openid')
  const mobile = await wechat.getPhoneNumber(phoneCode)

  // 2) 防劫持: openid 已绑在别的 mobile 上 → 拒绝
  const owner = await findUserByWx(openid)
  if (owner && owner.mobile !== mobile) {
    throw ApiError.conflict('该微信号已绑定其他手机号')
  }

  // 3) 按手机号找现有账号
  let user = await User.findOne({ mobile })

  if (user) {
    // 命中已有账号 (如试听转化建的家长): 绑定微信身份
    assertUserLoggable(user)
    user.wechatOpenId = openid
    await user.save()
  } else {
    // 全新访客: 自助注册, 需有效 scene.orgId
    const ctx = resolveScene(scene)
    if (!ctx) {
      return { status: 'need_org' }
    }
    const org = await Org.findById(ctx.orgId).select('_id').lean()
    if (!org) throw ApiError.badRequest('邀请机构不存在')
    user = await registerSelf({ mobile, openid, orgId: ctx.orgId, inviter: ctx.inviter })
  }

  // 4) 同源校验 + 算 orgs (与 wxLogin / login 走同一路径, 保证响应结构对齐)
  const orgs = await computeUserOrgs(user)
  if (orgs.length === 0 && !user.isPlatformAdmin) {
    // eslint-disable-next-line no-console
    console.warn(`[auth.wxBind] user has no orgs, reject: ${user._id} mobile=${mobile}`)
    throw ApiError.forbidden('账号未关联任何机构,请联系管理员')
  }

  const { accessToken, refreshToken } = await issueTokens(user, { ip, userAgent })
  return { status: 'bound', accessToken, refreshToken, user: publicUser(user), orgs }
}

module.exports = { wxLogin, wxBind }
