'use strict'

const mongoose = require('mongoose')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Position = require('@models/Position.model')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const { normalizePagination } = require('@utils/pagination')
const config = require('@config/index')

/**
 * 列出当前 org 的用户 (含职位名称)
 *
 * 查询参数：
 *   keyword   模糊匹配 realName / mobile / idCard（前端需要给提示）
 *   userType  all | staff | client
 *             staff  = 不持有 clientLevel>0 的职位
 *             client = 持有 clientLevel>0 的职位
 *             all    = 不过滤
 *   position  ObjectId，只保留持有该职位的用户
 *   region    ObjectId，按 User.region 精确匹配
 *   isActive  bool，是否启用
 */
async function list({ orgId, keyword, userType, position, region, isActive, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })

  // 1. 客户端职位 id 列表（用于 userType 过滤）：clientLevel > 0
  const clientPosFilter = { org: orgId, clientLevel: { $gt: 0 } }
  const clientPosIds = (await Position.find(clientPosFilter).select('_id').lean()).map((d) => d._id)
  const hasClient = clientPosIds.length > 0

  // 2. relFilter：org + 职位归属
  const relFilter = { org: orgId }
  if (position) {
    relFilter.positions = position
  } else if (userType === 'client' && hasClient) {
    relFilter.positions = { $in: clientPosIds }
  } else if (userType === 'staff') {
    if (hasClient) {
      // 持有任何职位，但不含客户端职位
      relFilter.positions = { $nin: clientPosIds }
    }
    // hasClient=false 时所有用户都视为 staff
  }

  // 3. userMatch：keyword / region / isActive
  const userMatch = {}
  if (keyword) {
    const re = { $regex: keyword, $options: 'i' }
    userMatch.$or = [{ realName: re }, { mobile: re }, { idCard: re }]
  }
  if (region) {
    if (mongoose.isValidObjectId(region)) {
      userMatch.region = region
    } else {
      // 非法 id 直接返回空集，避免正则报错
      return { items: [], total: 0, page: p.page, pageSize: p.pageSize }
    }
  }
  if (isActive === true || isActive === 'true') userMatch.isActive = true
  else if (isActive === false || isActive === 'false') userMatch.isActive = false

  const rels = await UserOrgRel.find(relFilter)
    .populate({
      path: 'user',
      match: userMatch,
      select: 'mobile realName avatar idCard region isActive'
    })
    .populate({
      path: 'positions',
      select: 'name isSystem clientLevel',
      populate: { path: 'org', select: 'name' }
    })
    .sort({ createdAt: -1 })
    .lean()

  let items = rels.filter((r) => r.user).map((r) => ({
    id: String(r.user._id),
    mobile: r.user.mobile,
    realName: r.user.realName,
    avatar: r.user.avatar,
    idCard: r.user.idCard,
    region: r.user.region ? String(r.user.region) : null,
    isActive: r.user.isActive,
    isMain: r.isMain,
    positions: (r.positions || []).map((pp) => ({
      id: String(pp._id),
      name: pp.name,
      isSystem: pp.isSystem,
      clientLevel: Number(pp.clientLevel) || 0
    }))
  }))

  const total = items.length
  items = items.slice(p.skip, p.skip + p.limit)
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(userId, orgId) {
  const user = await User.findById(userId)
    .populate('region', 'name level code')
    .select('mobile realName avatar idCard region isActive isPlatformAdmin isBlocked blockedAt blockedReason createdAt')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')
  const rel = await UserOrgRel.findOne({ user: userId, org: orgId })
    .populate('positions', 'name permissions isSystem clientLevel')
    .lean()
  return {
    ...user,
    id: String(user._id),
    region: user.region
      ? { id: String(user.region._id), name: user.region.name, level: user.region.level }
      : null,
    isMain: rel ? rel.isMain : false,
    positions: rel
      ? (rel.positions || []).map((p) => ({
          id: String(p._id),
          name: p.name,
          permissions: p.permissions,
          isSystem: p.isSystem,
          clientLevel: Number(p.clientLevel) || 0
        }))
      : []
  }
}

/**
 * 创建用户并关联到当前 org
 */
async function create({ orgId, mobile, password: pwd, realName, avatar, idCard, region, positions = [], isMain = false }) {
  const exist = await User.findOne({ mobile })
  if (exist) throw ApiError.conflict('手机号已注册')

  if (idCard) {
    const idExist = await User.findOne({ idCard }).select('_id').lean()
    if (idExist) throw ApiError.conflict('身份证号已存在')
  }

  const hash = await password.hash(pwd || config.seed.defaultPassword)
  const user = await User.create({
    mobile,
    passwordHash: hash,
    realName,
    avatar,
    idCard: idCard || null,
    region: region || null
  })

  // 校验 positions 都属于当前 org
  if (positions.length) {
    const valid = await Position.countDocuments({ _id: { $in: positions }, org: orgId })
    if (valid !== positions.length) throw ApiError.badRequest('包含不合法职位')
  }
  await UserOrgRel.create({ user: user._id, org: orgId, positions, isMain })

  return detail(user._id, orgId)
}

async function update(userId, payload) {
  // 身份证号唯一性手动校验（避免 partial index 的去重异常回包不友好）
  if (payload.idCard) {
    const dup = await User.findOne({ idCard: payload.idCard, _id: { $ne: userId } })
      .select('_id')
      .lean()
    if (dup) throw ApiError.conflict('身份证号已存在')
  }

  const user = await User.findByIdAndUpdate(userId, payload, { new: true, runValidators: true })
    .populate('region', 'name level code')
    .select('mobile realName avatar idCard region isActive isPlatformAdmin isBlocked blockedAt blockedReason createdAt')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')
  return {
    ...user,
    id: String(user._id),
    region: user.region
      ? { id: String(user.region._id), name: user.region.name, level: user.region.level }
      : null
  }
}

async function remove(userId, orgId) {
  // 解绑 org 关系 (不删 user)
  const rel = await UserOrgRel.findOneAndDelete({ user: userId, org: orgId })
  if (!rel) throw ApiError.notFound('用户不属于该机构')
  return { success: true }
}

async function changePassword(userId, oldPassword, newPassword) {
  const user = await User.findById(userId).select('+passwordHash')
  if (!user) throw ApiError.notFound('用户不存在')
  const ok = await password.verify(user.passwordHash, oldPassword)
  if (!ok) throw ApiError.badRequest('原密码错误')
  user.passwordHash = await password.hash(newPassword)
  await user.save()
  return { success: true }
}

async function resetPassword(userId, newPassword) {
  const user = await User.findByIdAndUpdate(userId, { passwordHash: await password.hash(newPassword) }, { new: true })
  if (!user) throw ApiError.notFound('用户不存在')
  return { success: true }
}

async function setPositions(userId, orgId, positions) {
  if (positions.length) {
    const valid = await Position.countDocuments({ _id: { $in: positions }, org: orgId })
    if (valid !== positions.length) throw ApiError.badRequest('包含不合法职位')
  }
  const rel = await UserOrgRel.findOneAndUpdate(
    { user: userId, org: orgId },
    { $set: { positions } },
    { new: true }
  ).populate('positions', 'name permissions isSystem clientLevel')

  if (!rel) throw ApiError.notFound('用户不属于该机构')
  return rel.toObject()
}

/**
 * 按手机号查找 user（不限制 org）。
 * 同时返回该 user 在当前 org 的 rel 情况，方便前端判断能否 attach。
 */
async function lookupByMobile(mobile, orgId) {
  if (!mobile) throw ApiError.badRequest('请提供手机号')
  const user = await User.findOne({ mobile })
    .select('mobile realName avatar idCard region isActive isPlatformAdmin')
    .populate('region', 'name level')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')

  const rel = await UserOrgRel.findOne({ user: user._id, org: orgId })
    .populate('positions', 'name isSystem clientLevel')
    .lean()

  return {
    id: String(user._id),
    mobile: user.mobile,
    realName: user.realName,
    avatar: user.avatar,
    idCard: user.idCard,
    region: user.region ? { id: String(user.region._id), name: user.region.name } : null,
    isActive: user.isActive,
    isPlatformAdmin: user.isPlatformAdmin,
    currentOrgRel: rel
      ? {
          id: String(rel._id),
          isMain: rel.isMain,
          positions: (rel.positions || []).map((p) => ({
            id: String(p._id),
            name: p.name,
            isSystem: p.isSystem,
            clientLevel: Number(p.clientLevel) || 0
          }))
        }
      : null
  }
}

/**
 * 把一个已存在的 user 关联到当前 org。
 * - 不检查 isActive（停用账号也能加）
 * - positions 留空 = 仅入机构，暂不分配职位
 * - 已存在 rel → 409（先解绑再加入）
 * - isMain 透传，前端不传则默认 false
 */
async function attachToOrg(userId, orgId, positions = [], isMain = false) {
  const user = await User.findById(userId).select('_id').lean()
  if (!user) throw ApiError.notFound('用户不存在')

  const dup = await UserOrgRel.findOne({ user: userId, org: orgId }).lean()
  if (dup) throw ApiError.conflict('该用户已在当前机构')

  if (positions.length) {
    const valid = await Position.countDocuments({ _id: { $in: positions }, org: orgId })
    if (valid !== positions.length) throw ApiError.badRequest('包含不合法职位')
  }

  const rel = await UserOrgRel.create({ user: userId, org: orgId, positions, isMain })
  const populated = await UserOrgRel.findById(rel._id).populate('positions', 'name isSystem clientLevel').lean()
  return populated
}

/**
 * 黑名单切换。isBlocked=true 时记录 blockedAt+blockedReason;
 *               isBlocked=false 时清空 blockedAt+blockedReason（极简版不做解禁留痕）。
 * 仅超管调用（路由层 requirePlatformAdmin 兜底）。
 */
async function setBlocked(userId, isBlocked, reason) {
  const update = isBlocked
    ? { isBlocked: true, blockedAt: new Date(), blockedReason: reason || null }
    : { isBlocked: false, blockedAt: null, blockedReason: null }
  const u = await User.findByIdAndUpdate(userId, { $set: update }, { new: true })
    .select('mobile realName isActive isPlatformAdmin isBlocked blockedAt blockedReason')
  if (!u) throw ApiError.notFound('用户不存在')
  return u
}

module.exports = { list, detail, create, update, remove, changePassword, resetPassword, setPositions, lookupByMobile, attachToOrg, setBlocked }
