'use strict'

const Student = require('@models/Student.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Position = require('@models/Position.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const password = require('@utils/password')
const config = require('@config/index')
const { CLIENT_LEVEL } = require('@shared/enums')

async function list({ orgId, keyword, isActive, isBlocked, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  // isBlocked=true 仅查黑名单；isBlocked=false 含未设置字段的学员(避免历史数据 null 漏掉)
  if (isBlocked === 'true' || isBlocked === true) filter.isBlocked = true
  if (isBlocked === 'false' || isBlocked === false) filter.isBlocked = { $ne: true }
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  const [items, total] = await Promise.all([
    Student.find(filter)
      .populate('guardians', 'mobile realName avatar')
      .populate('guardianUser', 'mobile realName')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Student.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id, orgId) {
  const s = await Student.findOne({ _id: id, org: orgId })
    .populate('guardians', 'mobile realName avatar')
    .populate('guardianUser', 'mobile realName')
    .lean()
  if (!s) throw ApiError.notFound('学生不存在')
  return s
}

async function create({ orgId, name, gender, birthday, guardianMobile, guardians = [], notes }) {
  // 如果传 guardianMobile，自动按手机号查 / 创 user，并建立与本机构的关联（家长角色）
  if (guardianMobile) {
    let u = await User.findOne({ mobile: guardianMobile })
    if (!u) {
      const hash = await password.hash(config.seed.defaultPassword)
      // 新建家长时，默认姓名为「家长-学生姓名」占位，待家长后续自行修改
      const defaultRealName = name ? `家长-${name}` : '家长'
      u = await User.create({ mobile: guardianMobile, realName: defaultRealName, passwordHash: hash })
    }
    if (!guardians.find((g) => String(g) === String(u._id))) {
      guardians = [...guardians, u._id]
    }
    // 确保该 user 与本机构存在关联，并赋予「基础家长」职位
    // 机构初始化时（org.service.create → ensureDefaultPositions）会保证 clientLevel=1 的「家长」位已存在；
    // 找不到时作为兜底按基础权限补建，并发场景走 11000 错误重试
    let parentPos = await Position.findOne({ org: orgId, clientLevel: CLIENT_LEVEL.BASIC })
      .select('_id')
      .lean()
    if (!parentPos) {
      try {
        parentPos = await Position.create({
          org: orgId,
          name: '家长',
          clientLevel: CLIENT_LEVEL.BASIC,
          permissions: [
            'student.read',
            'lessonSchedule.read',
            'lessonAttendance.read',
            'lessonWork.read', 'lessonWork.write',
            'points.read', 'pet.read'
          ]
        })
      } catch (e) {
        if (e && e.code === 11000) {
          parentPos = await Position.findOne({ org: orgId, clientLevel: CLIENT_LEVEL.BASIC })
            .select('_id')
            .lean()
        } else {
          throw e
        }
      }
    }
    if (!parentPos) throw ApiError.internal('无法为当前机构创建家长职位')
    await UserOrgRel.findOneAndUpdate(
      { user: u._id, org: orgId },
      { $setOnInsert: { user: u._id, org: orgId, positions: [parentPos._id] } },
      { upsert: true, new: true }
    )
  }

  const s = await Student.create({
    org: orgId,
    name,
    gender,
    birthday,
    guardians,
    guardianUser: guardians[0],
    notes
  })
  return detail(s._id, orgId)
}

async function update(id, orgId, payload) {
  const s = await Student.findOneAndUpdate({ _id: id, org: orgId }, payload, { new: true, runValidators: true })
  if (!s) throw ApiError.notFound('学生不存在')
  return detail(s._id, orgId)
}

async function remove(id, orgId) {
  const s = await Student.findOneAndUpdate({ _id: id, org: orgId }, { isActive: false }, { new: true })
  if (!s) throw ApiError.notFound('学生不存在')
  return s.toObject()
}

async function setGuardians(id, orgId, guardians) {
  // 校验所有 guardian 至少与本 org 有关联
  if (guardians.length) {
    const valid = await UserOrgRel.countDocuments({ user: { $in: guardians }, org: orgId })
    if (valid !== guardians.length) throw ApiError.badRequest('包含非本机构用户')
  }
  const s = await Student.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: { guardians, guardianUser: guardians[0] || undefined } },
    { new: true }
  )
  if (!s) throw ApiError.notFound('学生不存在')
  return detail(s._id, orgId)
}

/**
 * 黑名单切换。isBlocked=true 时记录 blockedAt+blockedReason;
 *               isBlocked=false 时清空 blockedAt+blockedReason（极简版不做解禁留痕）。
 * 仅超管调用（路由层 requirePlatformAdmin 兜底）。
 */
async function setBlocked(id, orgId, isBlocked, reason) {
  const update = isBlocked
    ? { isBlocked: true, blockedAt: new Date(), blockedReason: reason || null }
    : { isBlocked: false, blockedAt: null, blockedReason: null }
  const s = await Student.findOneAndUpdate({ _id: id, org: orgId }, { $set: update }, { new: true })
  if (!s) throw ApiError.notFound('学生不存在')
  return detail(s._id, orgId)
}

/**
 * 家长视角：查自己孩子
 */
async function listForGuardian({ orgId, userId }) {
  return Student.find({ org: orgId, guardians: userId, isActive: true, isBlocked: { $ne: true } })
    .select('name gender birthday notes')
    .lean()
}

module.exports = { list, detail, create, update, remove, setGuardians, setBlocked, listForGuardian }
