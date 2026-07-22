'use strict'

const mongoose = require('mongoose')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Position = require('@models/Position.model')
const CourseInstance = require('@models/CourseInstance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const Student = require('@models/Student.model')
const StudentProduct = require('@models/StudentProduct.model')
const StudentWork = require('@models/StudentWork.model')
const ApiError = require('@utils/ApiError')
const password = require('@utils/password')
const { normalizePagination } = require('@utils/pagination')
const removable = require('@utils/removable')
const config = require('@config/index')
const { isValidUserKey, DEFAULT_USER_AVATAR_KEY } = require('@shared/avatars')

async function listUnaffiliated({ keyword, isActive, isPlatformAdmin, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })

  // 孤儿用户 = 不在任何 UserOrgRel.user 的 user (UserOrgRel.user 字段有索引, distinct 高效)
  const relUserIds = await UserOrgRel.distinct('user')
  const filter = { _id: { $nin: relUserIds } }
  if (keyword) {
    const re = { $regex: keyword, $options: 'i' }
    filter.$or = [{ realName: re }, { mobile: re }, { idCard: re }]
  }
  if (isActive === true || isActive === 'true') filter.isActive = true
  else if (isActive === false || isActive === 'false') filter.isActive = false
  if (isPlatformAdmin === true || isPlatformAdmin === 'true') filter.isPlatformAdmin = true
  else if (isPlatformAdmin === false || isPlatformAdmin === 'false') filter.isPlatformAdmin = false

  const [rawItems, total] = await Promise.all([
    User.find(filter)
      .populate('region', 'name level')
      .sort({ createdAt: -1 })
      .skip(p.skip).limit(p.limit)
      .lean(),
    User.countDocuments(filter)
  ])

  return {
    items: rawItems.map((u) => ({
      id: String(u._id),
      mobile: u.mobile,
      realName: u.realName,
      idCard: u.idCard,
      isActive: u.isActive,
      isPlatformAdmin: u.isPlatformAdmin,
      isBlocked: u.isBlocked,
      requirePasswordChange: u.requirePasswordChange,
      region: u.region ? { id: String(u.region._id), name: u.region.name } : null,
      createdAt: u.createdAt
    })),
    total,
    page: p.page,
    pageSize: p.pageSize
  }
}

/**
 * 平台超管编辑游离用户。显式 allowlist 防越权, 不允许改 mobile / isPlatformAdmin / isBlocked / avatarSvgKey / passwordHash。
 */
async function updateUnaffiliated(userId, payload) {
  const allowed = ['realName', 'idCard', 'region', 'isActive']
  const update = {}
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) update[k] = payload[k]
  }
  if (update.idCard) {
    const dup = await User.findOne({ idCard: update.idCard, _id: { $ne: userId } })
      .select('_id').lean()
    if (dup) throw ApiError.conflict('身份证号已存在')
  }
  const u = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true })
    .populate('region', 'name level')
    .select('mobile realName idCard region isActive isPlatformAdmin isBlocked requirePasswordChange')
    .lean()
  if (!u) throw ApiError.notFound('用户不存在')
  return {
    ...u,
    id: String(u._id),
    region: u.region ? { id: String(u.region._id), name: u.region.name } : null
  }
}

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
async function list({ orgId, keyword, userType, position, region, isActive, roleScope, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })

  // 1. 客户端职位 id 列表（用于 userType 过滤）：clientLevel > 0
  const clientPosFilter = { org: orgId, clientLevel: { $gt: 0 } }
  const clientPosIds = (await Position.find(clientPosFilter).select('_id').lean()).map((d) => d._id)
  const hasClient = clientPosIds.length > 0
  // 2026-06-21: 新增 staff 职位 id 列表 (clientLevel = 0), roleScope=staff 用 $in 正确处理混合岗
  //   2026-06-21 cast-rel-positions-to-objectid migration 后 rel.positions 是 ObjectId, 这里直接用 ObjectId $in
  const staffPosFilter = { org: orgId, clientLevel: 0 }
  const staffPosIds = (await Position.find(staffPosFilter).select('_id').lean()).map((d) => d._id)

  // 2. relFilter：org + 职位归属
  const relFilter = { org: orgId }
  if (position) {
    relFilter.positions = position
  } else if (userType === 'client' && hasClient) {
    relFilter.positions = { $in: clientPosIds }
  } else if (roleScope === 'staff' && hasClient) {
    // 2026-06-21: roleScope=staff 用 $in: staffPosIds 正确处理"既是家长又是老师"的混合岗
    //   保留至少持有一个 clientLevel=0 职位的 user (员工 + 混合岗)
    //   纯家长 (所有 position 都是 clientLevel>0) 被排除
    if (staffPosIds.length === 0) {
      return { items: [], total: 0, page: p.page, pageSize: p.pageSize }
    }
    relFilter.positions = { $in: staffPosIds }
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
      select: 'mobile realName avatarSvgKey idCard region isActive'
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
    avatarSvgKey: r.user.avatarSvgKey || DEFAULT_USER_AVATAR_KEY,
    idCard: r.user.idCard,
    region: r.user.region ? String(r.user.region) : null,
    isActive: r.user.isActive,
    isMain: r.isMain,
    // 2026-06 加: C 端名师团队显示 (Org.showTeacherTeam 总开关 + 行级勾选)
    showAsTeacher: !!r.showAsTeacher,
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
    .select('mobile realName avatarSvgKey idCard region isActive isPlatformAdmin isBlocked blockedAt blockedReason createdAt')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')
  const rel = await UserOrgRel.findOne({ user: userId, org: orgId })
    .populate('positions', 'name permissions isSystem clientLevel')
    .lean()
  return {
    ...user,
    id: String(user._id),
    avatarSvgKey: user.avatarSvgKey || DEFAULT_USER_AVATAR_KEY,
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
async function create({ orgId, mobile, password: pwd, realName, avatarSvgKey, idCard, region, positions = [], isMain = false, isPlatformAdmin }) {
  // 2026-07-22: 业务硬约束 — 机构管理员不能添加平台超管
  // 超管身份必须由超管本人/上级超管在游离用户管理页专门设置, 不在 /users 创建流里
  if (isPlatformAdmin === true) {
    throw ApiError.badRequest('机构管理员不能添加平台超管; 超管身份请在「游离用户」管理页设置')
  }

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
    // 2026-07-05: avatar → avatarSvgKey (不入库为 'mom')
    avatarSvgKey: isValidUserKey(avatarSvgKey) ? avatarSvgKey : DEFAULT_USER_AVATAR_KEY,
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
  // 2026-07-22: 业务硬约束 — /users/:id 编辑是「机构员工视图」的修改入口,
  //   不允许改 mobile / isPlatformAdmin / isBlocked / avatarSvgKey / passwordHash 等关键字段
  //   走显式 allowlist, 不再透传 payload (之前透传导致前端易误改后端关键字段)
  const allowed = ['realName', 'idCard', 'region', 'isActive']
  const update = {}
  for (const k of allowed) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) update[k] = payload[k]
  }
  // 明确拒绝 isPlatformAdmin / isBlocked / mobile 等保护字段
  // 即便请求里传也直接忽略, 不入 update, 不抛错(前端老版本可能传)
  for (const k of ['isPlatformAdmin', 'isBlocked', 'mobile', 'passwordHash']) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      delete payload[k]
    }
  }

  // 身份证号唯一性手动校验（避免 partial index 的去重异常回包不友好）
  if (update.idCard) {
    const dup = await User.findOne({ idCard: update.idCard, _id: { $ne: userId } })
      .select('_id')
      .lean()
    if (dup) throw ApiError.conflict('身份证号已存在')
  }

  // 2026-07-05: avatar → avatarSvgKey 校验, 不再走 fileBind (SVG 是预制,不入 File 体系)
  if (update.avatarSvgKey !== undefined && update.avatarSvgKey !== null && !isValidUserKey(update.avatarSvgKey)) {
    throw ApiError.badRequest(`无效的头像类型: ${update.avatarSvgKey}`)
  }

  // 适配 payload 里旧的 'avatar' 键 (老前端兼容): 自动转写到 avatarSvgKey, 默认 mom
  if (Object.prototype.hasOwnProperty.call(payload, 'avatar')) {
    delete payload.avatar // 旧字段直接丢弃, 不再持久化
  }

  const user = await User.findByIdAndUpdate(userId, update, { new: true, runValidators: true })
    .populate('region', 'name level code')
    .select('mobile realName avatarSvgKey idCard region isActive isPlatformAdmin isBlocked blockedAt blockedReason createdAt')
    .lean()
  if (!user) throw ApiError.notFound('用户不存在')

  return {
    ...user,
    id: String(user._id),
    avatarSvgKey: user.avatarSvgKey || DEFAULT_USER_AVATAR_KEY,
    region: user.region
      ? { id: String(user.region._id), name: user.region.name, level: user.region.level }
      : null
  }
}

/**
 * 互锁检查声明（被 remove 与 removableCheck 共用）。
 * 阻挡"用户与本机构的解绑"的所有引用，全部 org 范围内。
 */
function userUsageChecks(orgId, userId) {
  return [
    {
      model: CourseInstance, filter: { org: orgId, teacher: userId },
      label: '开班(任课老师)', hint: '请先把该员工从开班中移除(改派其他老师)后再解绑'
    },
    {
      model: LessonSchedule, filter: { org: orgId, teacher: userId },
      label: '排课(任课老师)', hint: '请先把该员工从排课中移除后再解绑'
    },
    {
      model: LessonAttendance, filter: { org: orgId, evaluatedBy: userId },
      label: '考勤(课评人)', hint: '历史课评留有该员工痕迹, 请保留其与机构的归属'
    },
    {
      model: Student, filter: { org: orgId, $or: [{ guardianUser: userId }, { guardians: userId }] },
      label: '学员(监护人)', hint: '请先把该员工从所有学员的监护人列表中移除后再解绑'
    },
    {
      model: StudentProduct, filter: { org: orgId, giftedBy: userId },
      label: '赠课记录', hint: '历史赠课留有该员工痕迹, 请保留其与机构的归属'
    },
    {
      model: StudentWork, filter: { org: orgId, uploadedBy: userId },
      label: '作品(上传人)', hint: '历史作品留有该员工上传痕迹, 请保留其与机构的归属'
    }
  ]
}

async function remove(userId, orgId) {
  // 先校验存在
  const rel = await UserOrgRel.findOne({ user: userId, org: orgId }).select('_id').lean()
  if (!rel) throw ApiError.notFound('用户不属于该机构')

  // 互锁:该 user 在本机构仍有上述 6 类引用,则挡
  await removable.assertUnused(orgId, userUsageChecks(orgId, userId))

  // 解绑 org 关系 (不删 user 本体——用户可能还属于其他机构)
  await UserOrgRel.deleteOne({ _id: rel._id })
  return { success: true }
}

async function removableCheck(userId, orgId) {
  const rel = await UserOrgRel.findOne({ user: userId, org: orgId }).select('_id').lean()
  if (!rel) return { canRemove: false, blockers: [{ entity: 'UserOrgRel', label: '员工归属', count: 0, hint: '该用户不属于本机构,无需解绑' }] }
  return removable.check(orgId, userUsageChecks(orgId, userId))
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
 * 切换某员工作为"对外名师" (2026-06 加)。
 * 写入 UserOrgRel.showAsTeacher; 兜底校验 rel.positions 里没有任何 clientLevel > 0 (家长岗)。
 * 显示与否最终由 org.service.public() 配合 Org.showTeacherTeam 总开关决定。
 */
async function setTeacherFlag(userId, orgId, showAsTeacher) {
  const rel = await UserOrgRel.findOne({ user: userId, org: orgId })
    .populate({ path: 'positions', select: 'clientLevel' })
    .lean()
  if (!rel) throw ApiError.notFound('用户不属于该机构')
  // 兜底: 任何 clientLevel > 0 的岗位(家长岗) → 不允许设为对外名师
  if (showAsTeacher) {
    const positions = Array.isArray(rel.positions) ? rel.positions : []
    const isGuardian = positions.some((p) => Number(p.clientLevel) > 0)
    if (isGuardian) {
      throw ApiError.badRequest('仅机构员工可被设为对外名师, 家长身份不允许')
    }
  }
  await UserOrgRel.updateOne(
    { _id: rel._id },
    { $set: { showAsTeacher: !!showAsTeacher } }
  )
  return { id: userId, orgId, showAsTeacher: !!showAsTeacher }
}

/**
 * 按手机号查找 user（不限制 org）。
 * 同时返回该 user 在当前 org 的 rel 情况，方便前端判断能否 attach。
 */
async function lookupByMobile(mobile, orgId) {
  if (!mobile) throw ApiError.badRequest('请提供手机号')
  const user = await User.findOne({ mobile })
    .select('mobile realName avatarSvgKey idCard region isActive isPlatformAdmin')
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
    avatarSvgKey: user.avatarSvgKey || DEFAULT_USER_AVATAR_KEY,
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
 * - 2026-07-22: 业务硬约束 — 超管 (isPlatformAdmin=true) 不允许加入任何机构
 *   超管天然跨机构, 不需要 (也不应该) 拥有 UserOrgRel, 否则权限模型混乱 (超管机构视角会引入"主属机构"歧义)
 */
async function attachToOrg(userId, orgId, positions = [], isMain = false) {
  const user = await User.findById(userId).select('_id isPlatformAdmin realName mobile').lean()
  if (!user) throw ApiError.notFound('用户不存在')

  // 2026-07-22: 平台超管不加入任何机构
  if (user.isPlatformAdmin) {
    throw ApiError.badRequest(
      `该账号「${user.realName || user.mobile}」是平台超管, 无需也不能加入任何机构`
    )
  }

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

module.exports = { list, listUnaffiliated, updateUnaffiliated, detail, create, update, remove, removableCheck, changePassword, resetPassword, setPositions, setTeacherFlag, lookupByMobile, attachToOrg, setBlocked }
