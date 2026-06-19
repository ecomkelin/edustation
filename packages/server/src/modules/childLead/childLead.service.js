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

async function list({ orgId, currentUser, scope, status, keyword, parent, from, to, page, pageSize, promoteBy, consultant, inviteTeacher }) {
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
  if (inviteTeacher) filter.inviteTeacher = inviteTeacher
  if (keyword) {
    const kw = String(keyword).trim()
    if (kw) filter.name = { $regex: kw, $options: 'i' }
  }
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = new Date(from)
    if (to) filter.createdAt.$lte = new Date(to)
  }

  // 2026-06-19: promoteBy / consultant 是 Parent 字段, 走两步 — 先查匹配 Parent ids, 再过滤 ChildLeads
  //   - 都为 null 时跳过
  //   - 找不到匹配 Parent → 直接返回空 (避免下方再查一遍)
  //   - 跟 parent 过滤相交 (parent 精确 + promoteBy/consultant 范围)
  if (promoteBy || consultant) {
    const pf = { org: orgId }
    if (promoteBy) pf.promoteBy = promoteBy
    if (consultant) pf.consultant = consultant
    const matchedParents = await Parent.find(pf).select('_id').lean()
    if (matchedParents.length === 0) {
      return { items: [], total: 0, page: p.page, pageSize: p.pageSize, scope: effectiveScope }
    }
    const matchedIds = matchedParents.map((x) => x._id)
    if (filter.parent) {
      // 跟已有精确 parent 过滤相交 (mongoose 支持 $in + 等值的 $eq — 用 $in 等价 set 表达)
      const single = String(filter.parent)
      if (!matchedIds.some((id) => String(id) === single)) {
        return { items: [], total: 0, page: p.page, pageSize: p.pageSize, scope: effectiveScope }
      }
      // filter.parent 保持精确值, 不动
    } else {
      filter.parent = { $in: matchedIds }
    }
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
    // 2026-06-19 修 bug: c.parent 可能是 populate 出来的对象, String() 会变 "[object Object]"
    //   跟下面 line 130 的 `String(c.parent._id || c.parent)` 保持一致
    const parentIds = [...new Set(items.map((c) => c.parent?._id || c.parent).filter(Boolean).map(String))]
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

  // 解析试听科目类别数组 (2026-06-18: 改用 Category(model='Subject'))
  const rawSubjects = Array.isArray(body.trialSubjects) && body.trialSubjects.length > 0
    ? body.trialSubjects
    : (body.trialSubject ? [body.trialSubject] : [])
  const subjectIds = [...new Set(rawSubjects.filter(Boolean).map((s) => String(s)))]
  if (subjectIds.length > 0) {
    const Category = require('@models/Category.model')
    const validCount = await Category.countDocuments({
      _id: { $in: subjectIds },
      org: orgId,
      model: 'Subject'
    })
    if (validCount !== subjectIds.length) {
      throw ApiError.badRequest('试听科目类别包含不存在或不属于本机构的项')
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
  // status 白名单在 validator 已卡 (pending/contacted/lost 可手动改);
  // scheduled/tried/converted 是系统自动翻的, 手动改会破坏数据一致性
  // 改 lost 时必填 lostReason (前端 rules 已卡, 后端再补一次)
  if (safe.status === 'lost' && !safe.lostReason) {
    throw ApiError.unprocessable('改 lost 时必填 lostReason')
  }
  // 改回 pending/contacted 时清空 lostReason (避免历史原因残留)
  if (safe.status && safe.status !== 'lost') delete safe.lostReason

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

/* ─── 触点编辑 / 物理删 (2026-06-15) ────── */

// 24 小时内可改, 之后的操作只允许超管
const ACTIVITY_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

/**
 * 编辑触点 (PUT)
 *   权限:
 *     - 自己 + 24h 内 → 任何 recruit.write
 *     - 别人 / 超 24h → 仅 isPlatformAdmin
 *   不动 byUser (审计基线)
 *   改 at 之后要重算 parent 派生时间
 */
async function updateActivity({ childLeadId, activityId, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const child = await ChildLead.findOne({ _id: childLeadId, org: orgId })
  if (!child) throw ApiError.notFound('孩子潜客不存在')
  const activity = await LeadActivity.findOne({ _id: activityId, lead: childLeadId, org: orgId })
  if (!activity) throw ApiError.notFound('触点不存在')

  // 权限闸门
  const isOwner = String(activity.byUser) === String(currentUser.id)
  const isAdmin = !!currentUser.isPlatformAdmin
  const ageMs = Date.now() - new Date(activity.at || activity.createdAt).getTime()
  const inWindow = ageMs <= ACTIVITY_EDIT_WINDOW_MS
  if (!(isAdmin || (isOwner && inWindow))) {
    throw ApiError.forbidden(
      isOwner
        ? `仅 24 小时内可编辑自己创建的触点, 当前已超 ${Math.floor(ageMs / 3600000)} 小时`
        : '仅创建人 24 小时内或平台超管可编辑该触点'
    )
  }

  // 字段白名单 + 校验
  const set = {}
  if (body.type !== undefined) {
    if (!['call', 'wechat', 'visit', 'sms', 'note'].includes(body.type)) {
      throw ApiError.unprocessable('type 必须为 call/wechat/visit/sms/note')
    }
    set.type = body.type
  }
  if (body.remark !== undefined) set.remark = String(body.remark || '').slice(0, 500)
  let atChanged = false
  if (body.at !== undefined) {
    const t = new Date(body.at)
    if (isNaN(t.getTime())) throw ApiError.unprocessable('at 需为合法日期')
    if (t.getTime() > Date.now() + 60_000) throw ApiError.unprocessable('at 不可晚于当前时间')
    set.at = t
    atChanged = true
  }
  if (Object.keys(set).length === 0) throw ApiError.badRequest('无可更新字段')

  const updated = await LeadActivity.findOneAndUpdate(
    { _id: activityId },
    { $set: set },
    { new: true, runValidators: true }
  ).populate('byUser', 'mobile realName').lean()

  // at 改了 → parent 派生时间线可能变
  if (atChanged) await syncParentContactedAt(child.parent)
  return updated
}

/**
 * 物理删触点 (DELETE) — 平台超管 + 密码门控 (无软删)
 *   中间件 requirePlatformPassword 已验过身份 (isPlatformAdmin + 密码对)
 *   这里只查存在性 + 删 + 重算 parent 派生时间
 */
async function removeActivity({ childLeadId, activityId, orgId }) {
  const child = await ChildLead.findOne({ _id: childLeadId, org: orgId })
  if (!child) throw ApiError.notFound('孩子潜客不存在')
  const activity = await LeadActivity.findOneAndDelete({ _id: activityId, lead: childLeadId, org: orgId })
  if (!activity) throw ApiError.notFound('触点不存在')
  await syncParentContactedAt(child.parent)
  return { id: activityId, deleted: true }
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
  listActivities, createActivity, updateActivity, removeActivity, unconvert,
  syncParentContactedAt,
  childLeadUsageChecks
}
