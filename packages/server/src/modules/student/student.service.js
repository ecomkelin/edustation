'use strict'

const Student = require('@models/Student.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Position = require('@models/Position.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const StudentProduct = require('@models/StudentProduct.model')
const Parent = require('@models/Parent.model')
const PetAccount = require('@models/PetAccount.model')
const parentProfile = require('@modules/parent/parent.profile')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const password = require('@utils/password')
const removable = require('@utils/removable')
const config = require('@config/index')
const { CLIENT_LEVEL } = require('@shared/enums')

async function list({ orgId, keyword, isActive, isBlocked, school, hasPet, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  // isBlocked=true 仅查黑名单；isBlocked=false 含未设置字段的学员(避免历史数据 null 漏掉)
  if (isBlocked === 'true' || isBlocked === true) filter.isBlocked = true
  if (isBlocked === 'false' || isBlocked === false) filter.isBlocked = { $ne: true }
  if (school) filter.school = school
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  // 2026-06-22: hasPet 过滤（用于 admin 代领养弹窗）
  //   - hasPet=false → 过滤掉已有 PetAccount 的学员（默认期望）
  //   - hasPet=true  → 只返回已有 PetAccount 的学员
  //   - undefined    → 不过滤（兼容旧调用）
  if (hasPet === 'true' || hasPet === true) {
    const petStudentIds = await PetAccount.distinct('student', { org: orgId })
    filter._id = { $in: petStudentIds }
  } else if (hasPet === 'false' || hasPet === false) {
    const petStudentIds = await PetAccount.distinct('student', { org: orgId })
    filter._id = { $nin: petStudentIds }
  }
  const [items, total] = await Promise.all([
    Student.find(filter)
      .populate('guardians', 'mobile realName avatar')
      .populate('guardianUser', 'mobile realName')
      .populate('school', 'name type address')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Student.countDocuments(filter)
  ])

  // 2026-06: 增补 hasProfile (任一画像字段非空 → true)
  for (const it of items) {
    it.hasProfile = !!(
      (it.personality && it.personality !== '') ||
      (it.learningGoal && it.learningGoal !== '') ||
      (it.weakness && it.weakness !== '') ||
      (it.classFeedback && it.classFeedback !== '') ||
      (it.strengths && it.strengths !== '') ||
      (it.followUp && it.followUp !== '')
    )
  }

  // 2026-06-22: 增补 hasPet (PetAccount 是否有该学员的记录)
  //   用于 admin "代领养" 弹窗判断"是否已有宠物"
  const studentIds = items.map(i => i._id)
  if (studentIds.length > 0) {
    const petStudentIds = await PetAccount.distinct('student', { student: { $in: studentIds } })
    const petSet = new Set(petStudentIds.map(String))
    for (const it of items) {
      it.hasPet = petSet.has(String(it._id))
    }
  } else {
    for (const it of items) it.hasPet = false
  }

  // 2026-06-16: 增补家长沟通画像标记 (续课/谈判前看"沟通偏好"的核心场景)
  //   路径: Student.guardians[0] (主监护人) → User.mobile → Parent (org, phone) → Parent 画像字段
  //   2026-06-16 重构: 画像字段从 UserOrgRel 搬到 Parent, 不再绕道 rel
  //   - 三态: null=未关联潜客; false=已关联但未填; true=已填
  //   - Parent 字段有 default: '', 直接读 p.commStyle 等即可
  const phoneToParent = new Map()
  const phoneSet = new Set()
  for (const it of items) {
    const g = (it.guardians || [])[0]
    const phone = g && typeof g === 'object' ? (g.mobile || '') : ''
    if (phone) phoneSet.add(phone)
  }
  if (phoneSet.size > 0) {
    const parents = await Parent.find({ org: orgId, phone: { $in: [...phoneSet] } })
      .select('_id phone commStyle familyBg childFocus followUp')
      .lean()
    for (const p of parents) phoneToParent.set(p.phone, p)
    for (const it of items) {
      const g = (it.guardians || [])[0]
      const phone = g && typeof g === 'object' ? (g.mobile || '') : ''
      const parent = phone ? phoneToParent.get(phone) : null
      if (parent) {
        it.parentId = String(parent._id)
        it.hasParentProfile = !!(
          (parent.commStyle && parent.commStyle !== '') ||
          (parent.familyBg && parent.familyBg !== '') ||
          (parent.childFocus && parent.childFocus !== '') ||
          (parent.followUp && parent.followUp !== '')
        )
      } else {
        it.parentId = null
        it.hasParentProfile = false
      }
    }
  } else {
    for (const it of items) {
      it.parentId = null
      it.hasParentProfile = false
    }
  }

  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id, orgId) {
  const s = await Student.findOne({ _id: id, org: orgId })
    .populate('guardians', 'mobile realName avatar')
    .populate('guardianUser', 'mobile realName')
    .populate('school', 'name type address')
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  if (!s) throw ApiError.notFound('学生不存在')

  // 2026-06: 增补 profile 摘要 (与 notes 完全独立, 仅前端展示用)
  s.profile = {
    personality: s.personality || '',
    learningGoal: s.learningGoal || '',
    weakness: s.weakness || '',
    classFeedback: s.classFeedback || '',
    strengths: s.strengths || '',
    followUp: s.followUp || '',
    lastUpdatedBy: s.profileLastUpdatedBy
      ? { id: String(s.profileLastUpdatedBy._id || s.profileLastUpdatedBy.id), realName: s.profileLastUpdatedBy.realName }
      : null,
    lastUpdatedAt: s.profileLastUpdatedAt || null
  }

  // 2026-06-16: 增补家长沟通画像 (续课/谈判前看"沟通偏好"; 跨机构独立)
  //   路径: Student.guardians[0] (主监护人) → User.mobile → Parent (org, phone) → Parent 画像字段
  //   2026-06-16 重构: 画像字段从 UserOrgRel 搬到 Parent, 直接读 Parent.commStyle 等
  //   - null = 学员未关联潜客档案 (例如直接走"新建学生"流程, 没经过招生)
  //   - 非 null 但 4 字段全空 = 关联了家长档案但未填画像
  //   - parentId 一并返回, 前端弹 ParentProfileDialog 用
  const guardian = (s.guardians && s.guardians[0]) || s.guardianUser
  const guardianMobile = guardian && typeof guardian === 'object' ? (guardian.mobile || '') : ''
  if (guardianMobile) {
    const parent = await Parent.findOne({ org: orgId, phone: guardianMobile })
      .populate('profileLastUpdatedBy', 'realName')
      .lean()
    if (parent) {
      s.parentId = String(parent._id)
      s.parentProfile = parentProfile.shapeProfile(parent)  // 一行
    } else {
      s.parentId = null
      s.parentProfile = null
    }
  } else {
    s.parentId = null
    s.parentProfile = null
  }

  return s
}

async function create({ orgId, name, gender, birthday, guardianMobile, guardians = [], school, notes }) {
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
            'studentWork.read', 'studentWork.write',
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
    school: school || undefined,
    notes
  })
  return detail(s._id, orgId)
}

async function update(id, orgId, payload) {
  const s = await Student.findOneAndUpdate({ _id: id, org: orgId }, payload, { new: true, runValidators: true })
  if (!s) throw ApiError.notFound('学生不存在')
  return detail(s._id, orgId)
}

/**
 * 互锁检查声明（被 remove 与 removableCheck 共用）。
 * 学员的"软删"（isActive=false）会保留所有历史考勤/作品/积分/宠物，只挡
 * "在册"和"还有未用完课包"——这两类不解脱会让"已停用学员"仍然消耗课包资源。
 */
function studentUsageChecks(orgId, studentId) {
  return [
    {
      model: CourseEnrollment, filter: { org: orgId, student: studentId, status: 'enrolled' },
      label: '在册报名', hint: '请先办理该学员的退班/结业后再停用'
    },
    {
      model: StudentProduct, filter: { org: orgId, student: studentId, isActive: true, remainingLessons: { $gt: 0 } },
      label: '未用完课包', hint: '请先处理该学员的未用完课包(转课/退费)后再停用'
    }
  ]
}

async function remove(id, orgId) {
  // 存在性 + 软删
  const s = await Student.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!s) throw ApiError.notFound('学生不存在')

  // 互锁:在册 / 仍有未用完课包则挡
  await removable.assertUnused(orgId, studentUsageChecks(orgId, id))

  await Student.updateOne({ _id: id, org: orgId }, { $set: { isActive: false } })
  return { success: true, id }
}

async function removableCheck(id, orgId) {
  const s = await Student.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!s) return { canRemove: false, blockers: [{ entity: 'Student', label: '学员', count: 0, hint: '该学员不存在或不属于本机构' }] }
  return removable.check(orgId, studentUsageChecks(orgId, id))
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

module.exports = { list, detail, create, update, remove, removableCheck, setGuardians, setBlocked, listForGuardian }
