'use strict'

const mongoose = require('mongoose')
const TrialBooking = require('@models/TrialBooking.model')
const ChildLead = require('@models/ChildLead.model')
const Parent = require('@models/Parent.model')
const LeadActivity = require('@models/LeadActivity.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Student = require('@models/Student.model')
const Position = require('@models/Position.model')
const Room = require('@models/Room.model')

const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const removable = require('@utils/removable')
const password = require('@utils/password')

/**
 * 招生试听 - 试听预约 (TrialBooking) 业务逻辑
 *
 * 关键设计 (2026-06 重构):
 *   - preStudent 引用 ChildLead (替代 Lead)
 *   - parent 冗余 (TrialBooking.parent), 加速家长维度查询
 *   - 转化两步式: convert-preview (软预览) + convert (claim token + upsert 链)
 *   - 转化原子性: 用 TrialBooking.result.isEnrolled 翻转为 "claim token" + 各步
 *     findOneAndUpdate upsert 模式实现重试安全 (无 mongoose 事务)
 *   - 撤销转化: 5 分钟窗口, 由 childLead.service.unconvert 承担 (反向操作)
 *   - 1 家长带多孩: convert 时同 parent 下其他 ChildLead 自动 mark 'converted' (updateMany)
 *   - 同 phone 下首孩建 User 账号, 次孩复用
 */

/* ─── 列表 / 详情 ─────────────────────────────────── */

async function list({ orgId, status, from, to, teacher, subject, preStudent, parent, attemptNo, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (status) {
    const arr = String(status).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 1) filter.status = { $in: arr }
    else if (arr.length === 1) filter.status = arr[0]
  }
  if (teacher) filter.teacher = teacher
  if (subject) filter.subject = subject
  if (preStudent) filter.preStudent = preStudent
  if (parent) filter.parent = parent
  if (attemptNo) filter.attemptNo = Number(attemptNo)
  if (from || to) {
    filter.scheduledAt = {}
    if (from) filter.scheduledAt.$gte = new Date(from)
    if (to) filter.scheduledAt.$lte = new Date(to)
  }
  const [items, total] = await Promise.all([
    TrialBooking.find(filter)
      .populate('preStudent', 'name age gender grade className school trialSubject inviteTeacher')
      .populate('parent', 'phone lifecycle')
      .populate('teacher', 'mobile realName')
      .populate('subject', 'name')
      .populate('lessonSchedule', 'plannedStartTime plannedEndTime room title isTrialLesson status')
      .populate('consultant', 'mobile realName')
      .populate('result.negotiateTeacher', 'mobile realName')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    TrialBooking.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id, orgId) {
  const b = await TrialBooking.findOne({ _id: id, org: orgId })
    .populate('preStudent', 'name age gender grade className school trialSubject inviteTeacher source status')
    .populate('parent', 'phone lifecycle promoteBy consultant')
    .populate('teacher', 'mobile realName')
    .populate('subject', 'name')
    .populate('lessonSchedule', 'plannedStartTime plannedEndTime room title notes isTrialLesson status')
    .populate('consultant', 'mobile realName')
    .populate('result.negotiateTeacher', 'mobile realName')
    .populate('createdBy', 'mobile realName')
    .lean()
  if (!b) throw ApiError.notFound('试听预约不存在')
  return b
}

/* ─── 单笔跟班 (attached) ─────────────────────────── */

async function create({ orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const child = await ChildLead.findOne({ _id: body.preStudent, org: orgId }).lean()
  if (!child) throw ApiError.badRequest('孩子潜客不存在')
  const schedule = await LessonSchedule.findOne({ _id: body.lessonSchedule, org: orgId })
    .select('isTrialLesson plannedStartTime plannedEndTime teacher room courseInstance subject')
    .lean()
  if (!schedule) throw ApiError.badRequest('排课不存在')
  if (schedule.isTrialLesson) {
    throw ApiError.badRequest('不能蹭试听课 (isTrialLesson=true), 跟班仅支持正常课')
  }
  // 算 attemptNo
  const maxAttempt = await TrialBooking.findOne({ preStudent: child._id, org: orgId })
    .sort({ attemptNo: -1 })
    .select('attemptNo')
    .lean()
  const attemptNo = (maxAttempt?.attemptNo || 0) + 1
  const doc = await TrialBooking.create({
    org: orgId,
    preStudent: child._id,
    parent: child.parent,
    attemptNo,
    joinMode: 'attached',
    lessonSchedule: schedule._id,
    scheduledAt: schedule.plannedStartTime,
    scheduledDuration: schedule.plannedEndTime && schedule.plannedStartTime
      ? Math.round((new Date(schedule.plannedEndTime) - new Date(schedule.plannedStartTime)) / 60000)
      : 60,
    teacher: schedule.teacher,
    room: schedule.room || null,
    subject: schedule.subject || child.trialSubject || null,
    status: 'scheduled',
    remark: body.remark || '',
    createdBy: currentUser.id
  })
  // 翻 childLead.status='scheduled'
  if (child.status === 'pending' || child.status === 'contacted') {
    await ChildLead.updateOne({ _id: child._id }, { $set: { status: 'scheduled' } })
  }
  return detail(doc._id, orgId)
}

/* ─── 更新 (cancelled / remark) ───────────────────── */

async function update(id, orgId, body) {
  const safe = {}
  if (body.remark !== undefined) safe.remark = body.remark
  if (body.status === 'cancelled') safe.status = 'cancelled'
  const doc = await TrialBooking.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: safe },
    { new: true, runValidators: true }
  ).lean()
  if (!doc) throw ApiError.notFound('试听预约不存在')
  return doc
}

/* ─── 批量排课 (核心) ─────────────────────────────── */

async function batchSchedule({ orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const start = new Date(body.plannedStartTime)
  const end = new Date(body.plannedEndTime)
  if (!(start < end)) throw ApiError.badRequest('开始时间必须早于结束时间')

  // 1) 拉所有 bookings
  const bookings = await TrialBooking.find({
    _id: { $in: body.bookingIds },
    org: orgId
  })
  if (bookings.length !== body.bookingIds.length) {
    throw ApiError.badRequest('部分 bookingId 不属于本机构或不存在')
  }
  // 2) 校验状态
  for (const b of bookings) {
    if (b.status !== 'awaiting_schedule') {
      throw ApiError.badRequest(`预约 ${b._id} 状态非 awaiting_schedule (实际: ${b.status}), 无法批量排课`)
    }
  }

  // 3) teacher/room 校验 (不检测冲突; 试听 = 招生流程, 临时换老师/换教室很常见)
  if (!await User.exists({ _id: body.teacher })) throw ApiError.badRequest('teacher 不存在')
  if (body.room && !await Room.exists({ _id: body.room, org: orgId })) {
    throw ApiError.badRequest('room 不属于本机构')
  }

  // 4) 算 duration (分钟)
  const durationMinutes = Math.max(1, Math.round((end - start) / 60000))

  // 5) 批量更新 bookings
  const updateResult = await TrialBooking.updateMany(
    { _id: { $in: body.bookingIds }, status: 'awaiting_schedule' },
    {
      $set: {
        scheduledAt: start,
        scheduledDuration: durationMinutes,
        teacher: body.teacher,
        room: body.room || null,
        joinMode: 'solo',
        status: 'scheduled'
      }
    }
  )
  if (updateResult.modifiedCount !== bookings.length) {
    throw ApiError.unprocessable(`部分 booking 状态被其他流程改, 实际更新 ${updateResult.modifiedCount}/${bookings.length}, 请重试`)
  }

  // 6) 翻 ChildLead.status = 'scheduled'
  const childIds = bookings.map((b) => b.preStudent)
  await ChildLead.updateMany(
    { _id: { $in: childIds }, org: orgId, status: { $in: ['pending', 'contacted'] } },
    { $set: { status: 'scheduled' } }
  )

  return {
    bookingCount: bookings.length,
    scheduledAt: start,
    teacher: body.teacher,
    room: body.room || null,
    durationMinutes
  }
}

/* ─── 再约一次 (no_show / cancelled) ──────────────── */

async function reschedule({ id, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const oldBooking = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!oldBooking) throw ApiError.notFound('试听预约不存在')
  // 2026-06-15: cancelled 也允许再约
  if (!['no_show', 'cancelled'].includes(oldBooking.status)) {
    throw ApiError.badRequest(`仅 no_show / cancelled 状态可触发再约一次, 当前: ${oldBooking.status}`)
  }
  // 算新 attemptNo
  const maxAttempt = await TrialBooking.findOne({ preStudent: oldBooking.preStudent, org: orgId })
    .sort({ attemptNo: -1 })
    .select('attemptNo')
    .lean()
  const newAttempt = (maxAttempt?.attemptNo || 0) + 1
  // 写一条 LeadActivity 记录"再约一次"事件
  const oldStatusLabel = oldBooking.status === 'no_show' ? '未到' : '取消'
  await LeadActivity.create({
    org: orgId,
    lead: oldBooking.preStudent,
    type: 'note',
    byUser: currentUser.id,
    at: new Date(),
    remark: `第 ${oldBooking.attemptNo} 次${oldStatusLabel}, 重新约第 ${newAttempt} 次`
  })
  // 新建一条 awaiting_schedule
  const newBooking = await TrialBooking.create({
    org: orgId,
    preStudent: oldBooking.preStudent,
    parent: oldBooking.parent,
    attemptNo: newAttempt,
    joinMode: 'solo',
    subject: oldBooking.subject,
    status: 'awaiting_schedule',
    createdBy: currentUser.id,
    remark: `由 ${id} 再约产生`
  })
  // 直接调 batchSchedule
  return batchSchedule({
    orgId,
    currentUser,
    body: {
      bookingIds: [newBooking._id],
      plannedStartTime: body.plannedStartTime,
      plannedEndTime: body.plannedEndTime,
      teacher: body.teacher,
      room: body.room
    }
  })
}

/* ─── 到店打卡 ─────────────────────────────────── */

async function checkIn({ id, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (doc.status !== 'scheduled') {
    throw ApiError.badRequest(`仅 scheduled 状态可打卡, 当前 ${doc.status}`)
  }
  doc.status = 'arrived'
  doc.actualStartTime = body.actualStartTime ? new Date(body.actualStartTime) : new Date()
  await doc.save()
  return doc.toObject()
}

/* ─── 试听完成 (填 result) ──────────────────────── */

async function complete({ id, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (!['arrived', 'scheduled'].includes(doc.status)) {
    throw ApiError.badRequest(`仅 arrived / scheduled 可完成, 当前 ${doc.status}`)
  }
  doc.status = 'completed'
  if (body.actualEndTime) doc.actualEndTime = new Date(body.actualEndTime)
  if (body.result) {
    if (body.result.isEnrolled !== undefined) doc.result.isEnrolled = body.result.isEnrolled
    if (body.result.negotiateTeacher !== undefined) {
      doc.result.negotiateTeacher = body.result.negotiateTeacher
      // 同步到 consultant 字段 (2026-06 新增)
      doc.consultant = body.result.negotiateTeacher
    }
    if (body.result.attractionPoint !== undefined) doc.result.attractionPoint = body.result.attractionPoint
    if (body.result.reasonNotEnrolled !== undefined) doc.result.reasonNotEnrolled = body.result.reasonNotEnrolled
  }
  await doc.save()
  // 翻 childLead.status='tried' (若已 converted 保持)
  await ChildLead.updateOne(
    { _id: doc.preStudent, org: orgId, status: { $in: ['pending', 'contacted', 'scheduled'] } },
    { $set: { status: 'tried' } }
  )
  return doc.toObject()
}

/* ─── 转化预览 (软提交) ──────────────────────────── */

async function convertPreview({ id, orgId }) {
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
    .populate('preStudent', 'name gender school grade className parent')
    .populate('parent', 'phone user')
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (doc.status !== 'completed' || doc.result?.isEnrolled !== true) {
    throw ApiError.badRequest('仅 completed + result.isEnrolled=true 可触发转化预览')
  }
  const child = doc.preStudent
  if (!child) throw ApiError.notFound('孩子潜客不存在')
  // 拿 parent (优先 doc.parent, 回落 child.parent)
  const parent = doc.parent || (child.parent ? await Parent.findOne({ _id: child.parent, org: orgId }).lean() : null)
  if (!parent) throw ApiError.notFound('家长账户不存在')

  // 校验 child.convertedStudent 已存在 → 幂等返回
  const freshChild = await ChildLead.findOne({ _id: child._id, org: orgId }).select('convertedStudent').lean()
  if (freshChild?.convertedStudent) {
    return { alreadyConverted: true, childLeadId: String(child._id) }
  }

  const initialPassword = parent.phone.slice(-6)
  const existingUser = parent.user
    ? await User.findOne({ _id: parent.user }).select('_id mobile realName').lean()
    : await User.findOne({ mobile: parent.phone }).select('_id mobile realName').lean()
  const willCreateUser = !existingUser

  return {
    willCreateUser,
    willCreateStudent: true,
    initialPassword,
    previewUser: existingUser
      ? { mobile: existingUser.mobile, realName: existingUser.realName, requirePasswordChange: false, alreadyExists: true }
      : { mobile: parent.phone, realName: `家长-${parent.phone.slice(-4)}`, requirePasswordChange: true },
    previewStudent: {
      name: child.name,
      gender: child.gender,
      school: child.school,
      grade: child.grade,
      className: child.className
    }
  }
}

/* ─── 转化执行 (claim token + upsert 链 + 自动 mark 同 siblings) ── */

async function convert({ id, orgId, currentUser }) {
  if (!currentUser) throw ApiError.unauthorized()

  // Step 1: Claim token — 把 result.enrolledAt 从 null 翻为 now (原子操作作为重试安全 token)
  //   - 若返回 null, 已被别人翻转 (已转化), 走幂等返回
  const claimed = await TrialBooking.findOneAndUpdate(
    {
      _id: id,
      org: orgId,
      status: 'completed',
      'result.isEnrolled': true,
      'result.enrolledAt': null
    },
    { $set: { 'result.enrolledAt': new Date() } },
    { new: true }
  )
  if (!claimed) {
    // 二次校验: 已经被 claim 过 (enrolledAt 已存在)
    const existing = await TrialBooking.findOne({ _id: id, org: orgId }).lean()
    if (existing && existing.result?.enrolledAt) {
      const child = await ChildLead.findOne({ _id: existing.preStudent, org: orgId }).lean()
      return { idempotent: true, childLead: child, undoWindowMs: 5 * 60 * 1000 }
    }
    throw ApiError.unprocessable('正在转化中, 请稍后重试')
  }

  // Step 2: 拿 child + parent
  const child = await ChildLead.findOne({ _id: claimed.preStudent, org: orgId })
  if (!child) throw ApiError.notFound('孩子潜客不存在')
  if (child.convertedStudent) {
    return { idempotent: true, childLead: child.toObject(), undoWindowMs: 5 * 60 * 1000 }
  }
  const parent = await Parent.findOne({ _id: child.parent, org: orgId })
  if (!parent) throw ApiError.notFound('家长账户不存在')

  // Step 3: User upsert (findOneAndUpdate + $setOnInsert)
  //   - 同 phone 下首孩转化时建; 次孩复用 parent.user
  //   - $setOnInsert 避免覆盖已存在用户的姓名/密码
  let user = null
  if (parent.user) {
    user = await User.findOne({ _id: parent.user }).select('_id mobile realName requirePasswordChange').lean()
  }
  if (!user) {
    const passwordHash = await password.hash(parent.phone.slice(-6))
    user = await User.findOneAndUpdate(
      { mobile: parent.phone },
      {
        $setOnInsert: {
          mobile: parent.phone,
          passwordHash,
          realName: `家长-${parent.phone.slice(-4)}`,
          requirePasswordChange: true,
          isActive: true,
          isBlocked: false
        }
      },
      { upsert: true, new: true }
    )
  }

  // Step 4: UserOrgRel upsert (找 家长 position)
  const parentPos = await Position.findOne({ org: orgId, name: '家长' }).select('_id').lean()
  if (!parentPos) throw ApiError.unprocessable('未找到「家长」系统职位, 请先初始化机构')
  await UserOrgRel.findOneAndUpdate(
    { user: user._id, org: orgId },
    { $setOnInsert: { user: user._id, org: orgId, positions: [parentPos._id], isMain: true } },
    { upsert: true, new: true }
  )

  // Step 5: Parent.user 回填 (仅首次)
  if (!parent.user) {
    await Parent.updateOne({ _id: parent._id, user: null }, { $set: { user: user._id } })
  }

  // Step 6: Student create
  const student = await Student.create({
    org: orgId,
    name: child.name,
    gender: child.gender,
    school: child.school || null,
    grade: child.grade || '',
    className: child.className || '',
    guardianUser: user._id,
    guardians: [user._id],
    isActive: true
  })

  // Step 7: ChildLead 写回
  child.status = 'converted'
  child.convertedStudent = student._id
  child.convertedAt = new Date()
  child.convertedRemark = claimed.result?.attractionPoint || ''
  await child.save()

  // Step 8: 同 Parent 下其他 ChildLead 自动 mark (1 家长带多孩)
  //   - 排除当前 childLead
  //   - 仅对非 converted/lost 的 childLead 操作 (lost 状态不强制翻)
  const autoMarkResult = await ChildLead.updateMany(
    { parent: parent._id, _id: { $ne: child._id }, status: { $nin: ['converted', 'lost'] } },
    {
      $set: {
        status: 'converted',
        convertedAt: null,
        remark: '同家长其他孩子已报名'
      }
    }
  )
  const autoConvertedSiblingCount = autoMarkResult.modifiedCount || 0

  // Step 9: Parent.lifecycle 重算
  const { recomputeLifecycle } = require('@modules/parent/parent.service')
  const newLifecycle = await recomputeLifecycle(parent._id)

  return {
    idempotent: false,
    initialPassword: parent.phone.slice(-6),
    user: { id: String(user._id), mobile: user.mobile, realName: user.realName, requirePasswordChange: !!user.requirePasswordChange },
    student: { id: String(student._id), name: student.name, school: student.school, grade: student.grade, className: student.className },
    childLead: child.toObject(),
    parent: { id: String(parent._id), lifecycle: newLifecycle },
    undoWindowMs: 5 * 60 * 1000,
    autoConvertedSiblingCount
  }
}

/* ─── 物理删除 (高风险) ──────────────────────────── */

/**
 * 试听预约的"互锁"检查:
 *   只有「已取消」状态的预约可以物理删除, 其余状态一律阻挡。
 *   - awaiting_schedule / scheduled / arrived / no_show / completed 都不可删
 *   - completed 还会涉及转化下游 (User/Student/Parent.user 回填等), 物理删会破坏一致性
 *   - 其余进行中状态避免误操; 业务上「已取消」是无后续动作的死记录, 可清理
 */
function trialBookingUsageChecks(orgId, bookingId) {
  return [
    {
      model: TrialBooking,
      filter: { _id: bookingId, org: orgId, status: { $ne: 'cancelled' } },
      label: '非「已取消」状态',
      hint: '只有「已取消」状态的预约可物理删除; 请先在行内点 [取消] 把状态切到「已取消」, 再回到此行 [删除]'
    }
  ]
}

async function remove({ id, orgId }) {
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  await removable.assertUnused(orgId, trialBookingUsageChecks(orgId, id))
  await TrialBooking.deleteOne({ _id: id, org: orgId })
  return { id: String(id), deleted: true }
}

async function removableCheck({ id, orgId }) {
  return removable.check(orgId, trialBookingUsageChecks(orgId, id))
}

module.exports = {
  list, detail, create, update, remove, removableCheck,
  batchSchedule, checkIn, complete,
  convertPreview, convert, reschedule,
  trialBookingUsageChecks
}
