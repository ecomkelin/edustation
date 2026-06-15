'use strict'

const ChildLead = require('@models/ChildLead.model')
const Parent = require('@models/Parent.model')
const LeadActivity = require('@models/LeadActivity.model')
const TrialBooking = require('@models/TrialBooking.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const removable = require('@utils/removable')
// 复用 parent.service 的渠道解析 (内部带缓存)
const { getDefaultChannelId } = require('@modules/parent/parent.service')

/**
 * 招生试听 - 孩子潜客 (ChildLead) 业务逻辑
 *
 * 关键设计 (2026-06 重构, 替代原 lead.service 部分职责):
 *   - 1 Parent : N ChildLead (1 家长带多孩, 通过 ChildLead.parent 强绑)
 *   - 状态机: pending → contacted → scheduled → tried → converted | lost
 *     - pending/contacted: 销售手动 + createActivity
 *     - scheduled: TrialBooking 排课时 (trialBooking.service.batchSchedule) 自动翻
 *     - tried: TrialBooking 完成时 (trialBooking.service.complete) 自动翻
 *     - converted: 转化时 (trialBooking.service.convert) 自动翻 + 同步翻同 parent 下其他
 *     - lost: 销售手动 (PUT ?status=lost)
 *   - 触点: LeadActivity 1:N ChildLead;
 *     createActivity 时同步刷 childLead.lastContactedAt/By + parent.lastContactedAt/By
 *   - 撤销转化: 5 分钟窗口, 见 unconvert
 *   - 物理删除: 互锁 TrialBooking + LeadActivity
 */

/* ─── 列表 / 详情 ─────────────────────────────────── */

async function list({ orgId, currentUser, scope, status, keyword, parent, from, to, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  // 销售/教务分级
  const canSeeAll = currentUser && currentUser.isPlatformAdmin
  const effectiveScope = canSeeAll ? (scope || 'all') : 'mine'
  if (effectiveScope === 'mine' && currentUser) {
    filter.createdBy = currentUser.id
  }
  if (status) {
    const arr = String(status).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 1) filter.status = { $in: arr }
    else if (arr.length === 1) filter.status = arr[0]
  }
  if (parent) filter.parent = parent
  if (keyword) {
    const kw = String(keyword).trim()
    if (kw) filter.name = { $regex: kw, $options: 'i' }
  }
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = new Date(from)
    if (to) filter.createdAt.$lte = new Date(to)
  }

  const [items, total] = await Promise.all([
    ChildLead.find(filter)
      .populate('parent', 'phone lifecycle promoteBy consultant')
      .populate('school', 'name')
      .populate('trialSubject', 'name')
      .populate('inviteTeacher', 'mobile realName')
      .populate('createdBy', 'mobile realName')
      .populate('convertedStudent', 'name')
      .populate('source', 'name model')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    ChildLead.countDocuments(filter)
  ])

  // 派生: 最近一笔 TrialBooking
  if (items.length > 0) {
    const ids = items.map((c) => c._id)
    const recent = await TrialBooking.aggregate([
      { $match: { org: require('mongoose').Types.ObjectId.createFromHexString(String(orgId)), preStudent: { $in: ids } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$preStudent', doc: { $first: '$$ROOT' } } }
    ])
    const byChild = new Map(recent.map((r) => [String(r._id), r.doc]))
    for (const c of items) {
      const b = byChild.get(String(c._id))
      if (b) {
        c.latestBooking = {
          id: String(b._id),
          attemptNo: b.attemptNo,
          status: b.status,
          scheduledAt: b.scheduledAt
        }
      }
    }
    // 派生: 兄弟孩子 rank/count (同 parent 下"第几个孩子")
    const parentIds = [...new Set(items.map((c) => c.parent).filter(Boolean).map(String))]
    if (parentIds.length > 0) {
      const sibs = await ChildLead.aggregate([
        { $match: { org: require('mongoose').Types.ObjectId.createFromHexString(String(orgId)), parent: { $in: parentIds.map((p) => require('mongoose').Types.ObjectId.createFromHexString(p)) } } },
        { $sort: { createdAt: 1 } },
        { $group: { _id: '$parent', ids: { $push: '$_id' } } }
      ])
      const byParent = new Map(sibs.map((s) => [String(s._id), s.ids.map(String)]))
      for (const c of items) {
        if (!c.parent) continue
        const arr = byParent.get(String(c.parent._id || c.parent))
        if (arr && arr.length > 1) {
          const idx = arr.indexOf(String(c._id))
          if (idx >= 0) {
            c.sameParentCount = arr.length
            c.sameParentRank = idx + 1
          }
        }
      }
    }
  }

  return { items, total, page: p.page, pageSize: p.pageSize, scope: effectiveScope }
}

async function detail(id, orgId) {
  const child = await ChildLead.findOne({ _id: id, org: orgId })
    .populate('parent', 'phone lifecycle promoteBy consultant user tags')
    .populate('school', 'name')
    .populate('trialSubject', 'name')
    .populate('inviteTeacher', 'mobile realName')
    .populate('createdBy', 'mobile realName')
    .populate('convertedStudent', 'name school grade className')
    .populate('sameAs', 'name createdAt status')
    .populate('source', 'name model')
    .lean()
  if (!child) throw ApiError.notFound('孩子潜客不存在')

  // 触点时间线 (limit 50)
  const activities = await LeadActivity.find({ lead: child._id, org: orgId })
    .populate('byUser', 'mobile realName')
    .sort({ at: -1 })
    .limit(50)
    .lean()
  // 全部 TrialBooking (按 attemptNo 升序)
  const bookings = await TrialBooking.find({ preStudent: child._id, org: orgId })
    .populate('teacher', 'mobile realName')
    .populate('subject', 'name')
    .populate('consultant', 'mobile realName')
    .populate('lessonSchedule')
    .sort({ attemptNo: 1 })
    .lean()

  // 派生: 兄弟孩子列表 (同 parent 下, 不含自己)
  let siblings = []
  if (child.parent) {
    siblings = await ChildLead.find({ parent: child.parent._id || child.parent, _id: { $ne: child._id }, org: orgId })
      .select('_id name status createdAt')
      .sort({ createdAt: 1 })
      .lean()
  }

  child.activities = activities
  child.bookings = bookings
  child.siblings = siblings
  return child
}

/* ─── 单创建 (parentId 必填) ───────────────────── */

async function create({ orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const parent = await Parent.findOne({ _id: body.parentId, org: orgId }).lean()
  if (!parent) throw ApiError.badRequest('家长账户不存在')

  // 解析试听科目数组
  const rawSubjects = Array.isArray(body.trialSubjects) && body.trialSubjects.length > 0
    ? body.trialSubjects
    : (body.trialSubject ? [body.trialSubject] : [])
  const subjectIds = [...new Set(rawSubjects.filter(Boolean).map((s) => String(s)))]
  if (subjectIds.length > 0) {
    const Subject = require('@models/Subject.model')
    const validCount = await Subject.countDocuments({ _id: { $in: subjectIds }, org: orgId })
    if (validCount !== subjectIds.length) {
      throw ApiError.badRequest('试听科目包含不存在或不属于本机构的项')
    }
  }

  const child = await ChildLead.create({
    org: orgId,
    parent: parent._id,
    name: body.name,
    gender: body.gender || null,
    age: body.age || null,
    school: body.school || null,
    grade: body.grade || '',
    className: body.className || '',
    trialSubject: subjectIds[0] || null,
    trialSubjects: subjectIds,
    trialFee: body.trialFee || 0,
    inviteTeacher: body.inviteTeacher || currentUser.id,
    expectedTime: body.expectedTime || '',
    specificDate: body.specificDate || null,
    // source 优先 body → 继承 parent.source → 兜底 defaultChannel (地推)
    source: body.source || parent.source || (await getDefaultChannelId()) || null,
    sameAs: Array.isArray(body.sameAs) ? body.sameAs : [],
    remark: body.remark || '',
    createdBy: currentUser.id,
    status: 'pending'
  })

  // 自动建 N 笔 TrialBooking
  const bookingCount = Math.max(subjectIds.length, 1)
  const bookings = []
  for (let i = 0; i < bookingCount; i++) {
    bookings.push({
      org: orgId,
      preStudent: child._id,
      parent: parent._id,
      attemptNo: i + 1,
      joinMode: 'solo',
      status: 'awaiting_schedule',
      subject: subjectIds[i] || null,
      createdBy: currentUser.id
    })
  }
  if (bookings.length > 0) await TrialBooking.insertMany(bookings)

  return child.toObject()
}

/* ─── 更新 (基础信息) ─────────────────────────── */

async function update(id, orgId, body) {
  // 不可改: createdBy / parent / convertedStudent/At/Remark
  const safe = { ...body }
  delete safe.createdBy
  delete safe.parent
  delete safe.convertedStudent
  delete safe.convertedAt
  delete safe.convertedRemark
  delete safe.lastContactedAt
  delete safe.lastContactedBy
  // status 白名单
  if (safe.status && !['contacted', 'lost'].includes(safe.status)) delete safe.status

  const doc = await ChildLead.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: safe },
    { new: true, runValidators: true }
  ).lean()
  if (!doc) throw ApiError.notFound('孩子潜客不存在')
  return doc
}

/* ─── 触点日志 ─────────────────────────────────── */

async function listActivities(id, orgId) {
  const childExists = await ChildLead.exists({ _id: id, org: orgId })
  if (!childExists) throw ApiError.notFound('孩子潜客不存在')
  return LeadActivity.find({ lead: id, org: orgId })
    .populate('byUser', 'mobile realName')
    .sort({ at: -1 })
    .lean()
}

async function createActivity(id, orgId, currentUser, body) {
  if (!currentUser) throw ApiError.unauthorized()
  const child = await ChildLead.findOne({ _id: id, org: orgId })
  if (!child) throw ApiError.notFound('孩子潜客不存在')
  const at = body.at ? new Date(body.at) : new Date()
  // 1) 创建触点
  const activity = await LeadActivity.create({
    org: orgId,
    lead: id,
    type: body.type,
    byUser: currentUser.id,
    at,
    remark: body.remark || ''
  })
  // 2) 同步 childLead.lastContactedAt/By
  child.lastContactedAt = at
  child.lastContactedBy = currentUser.id
  // 状态机: pending → contacted (仅当还是 pending 时翻)
  if (child.status === 'pending') child.status = 'contacted'
  await child.save()

  // 3) 同步 parent.lastContactedAt/By (聚合最新; 同 parent 下所有 childLead 触点的 max)
  await syncParentContactedAt(child.parent)

  return activity.toObject()
}

async function syncParentContactedAt(parentId) {
  if (!parentId) return
  // 拉同 parent 下所有 childLead 的最新触点
  const childIds = await ChildLead.find({ parent: parentId }).select('_id').lean()
  const ids = childIds.map((c) => c._id)
  if (ids.length === 0) return
  const latest = await LeadActivity.find({ lead: { $in: ids } })
    .sort({ at: -1 })
    .limit(1)
    .select('at byUser')
    .lean()
  if (latest.length === 0) return
  const earliest = await LeadActivity.find({ lead: { $in: ids } })
    .sort({ at: 1 })
    .limit(1)
    .select('at')
    .lean()
  await Parent.updateOne(
    { _id: parentId },
    {
      $set: {
        lastContactedAt: latest[0].at,
        lastContactedBy: latest[0].byUser,
        firstContactedAt: earliest[0]?.at || null
      }
    }
  )
}

/* ─── 撤销转化 (5 分钟窗口) ───────────────────── */

const UNCONVERT_WINDOW_MS = 5 * 60 * 1000

async function unconvert({ id, orgId, currentUser }) {
  if (!currentUser) throw ApiError.unauthorized()
  const child = await ChildLead.findOne({ _id: id, org: orgId })
  if (!child) throw ApiError.notFound('孩子潜客不存在')
  if (child.status !== 'converted' || !child.convertedAt) {
    throw ApiError.unprocessable('该孩子未转化或无法撤销')
  }
  const elapsed = Date.now() - new Date(child.convertedAt).getTime()
  if (elapsed > UNCONVERT_WINDOW_MS) {
    throw ApiError.unprocessable('已超过 5 分钟撤销窗口, 业务上认账')
  }
  const Student = require('@models/Student.model')
  const User = require('@models/User.model')
  const UserOrgRel = require('@models/UserOrgRel.model')
  const StudentProduct = require('@models/StudentProduct.model')
  const LessonAttendance = require('@models/LessonAttendance.model')
  const Position = require('@models/Position.model')

  // 校验 Student/Student 仍干净 (没有下游引用; 若有, 拒绝撤销)
  if (child.convertedStudent) {
    const spCount = await StudentProduct.countDocuments({ student: child.convertedStudent })
    const attCount = await LessonAttendance.countDocuments({ student: child.convertedStudent })
    if (spCount || attCount) {
      throw ApiError.unprocessable('新学员已有课包/考勤记录, 无法撤销 (请联系超管)')
    }
  }

  const parent = await Parent.findOne({ _id: child.parent, org: orgId }).lean()
  const userId = parent?.user

  // 校验 userId 是否被其他 ChildLead.convertedStudent 引用
  let otherConvertedCount = 0
  if (userId) {
    otherConvertedCount = await ChildLead.countDocuments({
      _id: { $ne: child._id },
      parent: child.parent,
      status: 'converted',
      convertedStudent: { $ne: null }
    })
  }

  // 拿回 TrialBooking (用于 result 重置)
  const bookings = await TrialBooking.find({ preStudent: child._id, org: orgId, 'result.isEnrolled': true })

  // 1) 物理删除 Student
  if (child.convertedStudent) {
    await Student.deleteOne({ _id: child.convertedStudent })
  }
  // 2) 物理删除 User 仅当无其他 converted 兄弟; 否则保留 User
  if (userId && otherConvertedCount === 0) {
    await User.deleteOne({ _id: userId, requirePasswordChange: true })
    // 删 UserOrgRel
    const parentPos = await Position.findOne({ org: orgId, name: '家长' }).select('_id').lean()
    if (parentPos) {
      await UserOrgRel.deleteOne({ user: userId, org: orgId, positions: [parentPos._id] })
    }
    // 解绑 Parent.user
    await Parent.updateOne({ _id: child.parent, user: userId }, { $set: { user: null } })
  }
  // 3) TrialBooking result 重置
  for (const b of bookings) {
    b.result = {
      isEnrolled: null,
      negotiateTeacher: null,
      attractionPoint: '',
      reasonNotEnrolled: '',
      enrolledAt: null
    }
    await b.save()
  }

  // 4) ChildLead 状态回退
  child.status = 'tried'
  child.convertedStudent = null
  child.convertedAt = null
  child.convertedRemark = ''
  await child.save()

  // 5) Parent.lifecycle 重算
  const { recomputeLifecycle } = require('@modules/parent/parent.service')
  await recomputeLifecycle(child.parent)

  return {
    id: String(child._id),
    rolledBack: true,
    userDeleted: otherConvertedCount === 0
  }
}

/* ─── 物理删除 (互锁) ───────────────────────── */

function childLeadUsageChecks(orgId, childLeadId) {
  return [
    {
      model: TrialBooking,
      filter: { org: orgId, preStudent: childLeadId },
      label: '试听记录', hint: '请先删除该孩子的所有试听'
    },
    {
      model: LeadActivity,
      filter: { org: orgId, lead: childLeadId },
      label: '触点日志', hint: '触点日志将一并删除'
    }
  ]
}

async function remove({ id, orgId }) {
  const doc = await ChildLead.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('孩子潜客不存在')
  await removable.assertUnused(orgId, childLeadUsageChecks(orgId, id))
  // 互锁通过 → 物理删除
  await LeadActivity.deleteMany({ lead: id, org: orgId })
  await TrialBooking.deleteMany({ preStudent: id, org: orgId })
  await ChildLead.deleteOne({ _id: id, org: orgId })
  return { id: String(id), deleted: true }
}

async function removableCheck({ id, orgId }) {
  return removable.check(orgId, childLeadUsageChecks(orgId, id))
}

module.exports = {
  list, detail, create, update, remove, removableCheck,
  listActivities, createActivity, unconvert,
  syncParentContactedAt,
  childLeadUsageChecks
}
