'use strict'

const mongoose = require('mongoose')
const TrialBooking = require('@models/TrialBooking.model')
const Lead = require('@models/Lead.model')
const LeadActivity = require('@models/LeadActivity.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const CourseInstance = require('@models/CourseInstance.model')
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
 * 关键设计:
 *   - batchSchedule 批量排课: 1 个 LessonSchedule 挂 N 个 TrialBooking (1:N 共享)
 *   - 转化两步式: convert-preview (软预览) + convert (claim token + upsert 链)
 *   - 转化原子性: 用 TrialBooking.result.isEnrolled 翻转为 "claim token" + 各步
 *     findOneAndUpdate upsert 模式实现重试安全 (无 mongoose 事务)
 *   - 撤销转化: 5 分钟窗口, 由 lead.service.unconvert 承担 (反向操作)
 */

/* ─── 列表 / 详情 ─────────────────────────────────── */

async function list({ orgId, status, from, to, teacher, subject, preStudent, attemptNo, page, pageSize }) {
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
  if (attemptNo) filter.attemptNo = Number(attemptNo)
  if (from || to) {
    filter.scheduledAt = {}
    if (from) filter.scheduledAt.$gte = new Date(from)
    if (to) filter.scheduledAt.$lte = new Date(to)
  }
  const [items, total] = await Promise.all([
    TrialBooking.find(filter)
      .populate('preStudent', 'name phone age gender grade className school trialSubject inviteTeacher')
      .populate('teacher', 'mobile realName')
      .populate('subject', 'name')
      .populate('lessonSchedule', 'plannedStartTime plannedEndTime room title isTrialLesson status')
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
    .populate('preStudent', 'name phone age gender grade className school trialSubject inviteTeacher source')
    .populate('teacher', 'mobile realName')
    .populate('subject', 'name')
    .populate('lessonSchedule', 'plannedStartTime plannedEndTime room title notes isTrialLesson status')
    .populate('result.negotiateTeacher', 'mobile realName')
    .populate('createdBy', 'mobile realName')
    .lean()
  if (!b) throw ApiError.notFound('试听预约不存在')
  return b
}

/* ─── 单笔跟班 (attached) ─────────────────────────── */

async function create({ orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const lead = await Lead.findOne({ _id: body.preStudent, org: orgId }).lean()
  if (!lead) throw ApiError.badRequest('潜客不存在')
  const schedule = await LessonSchedule.findOne({ _id: body.lessonSchedule, org: orgId })
    .select('isTrialLesson plannedStartTime plannedEndTime teacher room courseInstance subject')
    .lean()
  if (!schedule) throw ApiError.badRequest('排课不存在')
  if (schedule.isTrialLesson) {
    throw ApiError.badRequest('不能蹭试听课 (isTrialLesson=true), 跟班仅支持正常课')
  }
  // 算 attemptNo
  const maxAttempt = await TrialBooking.findOne({ preStudent: lead._id, org: orgId })
    .sort({ attemptNo: -1 })
    .select('attemptNo')
    .lean()
  const attemptNo = (maxAttempt?.attemptNo || 0) + 1
  const doc = await TrialBooking.create({
    org: orgId,
    preStudent: lead._id,
    attemptNo,
    joinMode: 'attached',
    lessonSchedule: schedule._id,
    scheduledAt: schedule.plannedStartTime,
    scheduledDuration: schedule.plannedEndTime && schedule.plannedStartTime
      ? Math.round((new Date(schedule.plannedEndTime) - new Date(schedule.plannedStartTime)) / 60000)
      : 60,
    teacher: schedule.teacher,
    room: schedule.room || null,  // 2026-06 试听也存 room (与 batchSchedule 一致)
    subject: schedule.subject || lead.trialSubject || null,
    status: 'scheduled',
    remark: body.remark || '',
    createdBy: currentUser.id
  })
  // 翻 lead.status='scheduled'
  if (lead.status === 'pending' || lead.status === 'contacted') {
    await Lead.updateOne({ _id: lead._id }, { $set: { status: 'scheduled' } })
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

/**
 * batchSchedule: 多选 TrialBooking (status=awaiting_schedule) → 1 个 LessonSchedule
 *
 * 流程:
 *   1. 校验入参 (bookingIds 非空 / time 顺序 / teacher room 存在)
 *   2. 拉所有 booking, 校验全部 awaiting_schedule + 全部 subject 一致
 *   3. 拉 [试听专用] CourseInstance (idempotent)
 *   4. detectConflict (teacher/room/time) — 试听排课也走完整冲突检测
 *   5. 算 lessonNo (该 [试听专用] CI 下 lessonNo max + 1)
 *   6. 创建 1 个 LessonSchedule (courseInstance=trialInstance, isTrialLesson=true, ...)
 *   7. 批量 updateMany TrialBooking (status awaiting_schedule → scheduled, 填 scheduledAt/teacher/room)
 *   8. 同步翻对应 Lead.status = 'scheduled'
 *   9. 返回 { bookingCount, scheduledAt, teacher, room }
 *
 * 2026-06 改造: 试听不再创建 LessonSchedule 中间层, 直接存 TrialBooking 自身的时间/老师/教室.
 *   业务上试听 = 招生数据跟踪, 不占用排课系统 (日历/冲突检测/教室利用率 都不算它).
 *   历史 isTrialLesson=true 的 LessonSchedule 保留 (兼容老数据展示), 新流程不再生成.
 */
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
  // 3) 试听混合多课 (2026-06): 不再校验 subject 一致; 同一试听日程可挂不同 subject 的 booking
  //   例: 1 老师带 5 个 Python + 3 个围棋 孩子试同一节体验课
  //   各 booking 自己的 subject 保留 (来自 lead 录入时按 trialSubjects 拆), 排课不覆盖

  // 4) teacher/room 校验 (不检测冲突; 试听 = 招生流程, 临时换老师/换教室很常见)
  if (!await User.exists({ _id: body.teacher })) throw ApiError.badRequest('teacher 不存在')
  if (body.room && !await Room.exists({ _id: body.room, org: orgId })) {
    throw ApiError.badRequest('room 不属于本机构')
  }

  // 5) 算 duration (分钟)
  const durationMinutes = Math.max(1, Math.round((end - start) / 60000))

  // 6) 批量更新 bookings — 2026-06: 直接写 TrialBooking 自身, 不创建 LessonSchedule
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
        // lessonSchedule 留空 — 试听不再挂 LessonSchedule
        // subject 不覆盖 — 保留各 booking 自己的 subject (来自 lead 录入)
      }
    }
  )
  if (updateResult.modifiedCount !== bookings.length) {
    // 极端竞态: 部分被改了, 报错 (此 batch 整体回滚不现实, 让用户重试)
    throw ApiError.unprocessable(`部分 booking 状态被其他流程改, 实际更新 ${updateResult.modifiedCount}/${bookings.length}, 请重试`)
  }

  // 7) 翻 Lead.status = 'scheduled'
  const leadIds = bookings.map((b) => b.preStudent)
  await Lead.updateMany(
    { _id: { $in: leadIds }, org: orgId, status: { $in: ['pending', 'contacted'] } },
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

/* ─── 再约一次 (no_show 后的新批次) ──────────────── */

/**
 * reschedule: 单笔 no_show 走 batch-schedule 路径
 *   - 把原 booking.status=no_show 保留 (审计)
 *   - 用新 schedule + 新 booking 走 batchSchedule
 *   - 这里实现是: 创建新 attemptNo=max+1 的 awaiting_schedule booking, 调 batchSchedule
 *   - 但 batchSchedule 期望的是 await 状态的; 所以先建新 booking 再调
 */
async function reschedule({ id, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const oldBooking = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!oldBooking) throw ApiError.notFound('试听预约不存在')
  if (oldBooking.status !== 'no_show') {
    throw ApiError.badRequest('仅 no_show 状态可触发再约一次')
  }
  // 算新 attemptNo
  const maxAttempt = await TrialBooking.findOne({ preStudent: oldBooking.preStudent, org: orgId })
    .sort({ attemptNo: -1 })
    .select('attemptNo')
    .lean()
  const newAttempt = (maxAttempt?.attemptNo || 0) + 1
  // 写一条 LeadActivity 记录"再约一次"事件
  await LeadActivity.create({
    org: orgId,
    lead: oldBooking.preStudent,
    type: 'note',
    byUser: currentUser.id,
    at: new Date(),
    remark: `第 ${oldBooking.attemptNo} 次未到, 重新约第 ${newAttempt} 次`
  })
  // 新建一条 awaiting_schedule
  const newBooking = await TrialBooking.create({
    org: orgId,
    preStudent: oldBooking.preStudent,
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
    if (body.result.negotiateTeacher !== undefined) doc.result.negotiateTeacher = body.result.negotiateTeacher
    if (body.result.attractionPoint !== undefined) doc.result.attractionPoint = body.result.attractionPoint
    if (body.result.reasonNotEnrolled !== undefined) doc.result.reasonNotEnrolled = body.result.reasonNotEnrolled
  }
  await doc.save()
  // 翻 lead.status='tried' (若已 converted 保持)
  await Lead.updateOne(
    { _id: doc.preStudent, org: orgId, status: { $in: ['pending', 'contacted', 'scheduled'] } },
    { $set: { status: 'tried' } }
  )
  return doc.toObject()
}

/* ─── 转化预览 (软提交) ──────────────────────────── */

async function convertPreview({ id, orgId }) {
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (doc.status !== 'completed' || doc.result?.isEnrolled !== true) {
    throw ApiError.badRequest('仅 completed + result.isEnrolled=true 可触发转化预览')
  }
  const lead = await Lead.findOne({ _id: doc.preStudent, org: orgId }).lean()
  if (!lead) throw ApiError.notFound('潜客不存在')
  if (lead.convertedStudent) {
    return { alreadyConverted: true, lead }
  }
  const initialPassword = lead.phone.slice(-6)
  const existingUser = await User.findOne({ mobile: lead.phone }).select('_id mobile realName').lean()
  const willCreateUser = !existingUser
  const willCreateStudent = true
  return {
    willCreateUser,
    willCreateStudent,
    initialPassword,
    previewUser: {
      mobile: lead.phone,
      realName: `家长-${lead.name}`,
      requirePasswordChange: willCreateUser
    },
    previewStudent: {
      name: lead.name,
      gender: lead.gender,
      school: lead.school,
      grade: lead.grade,
      className: lead.className
    }
  }
}

/* ─── 转化执行 (claim token + upsert 链) ─────────── */

async function convert({ id, orgId, currentUser }) {
  if (!currentUser) throw ApiError.unauthorized()

  // Step 1: Claim token — 把 result.isEnrolled null → true 原子翻转
  //   - 若返回 null, 已被别人翻转 (已转化), 走幂等返回
  const claimed = await TrialBooking.findOneAndUpdate(
    {
      _id: id,
      org: orgId,
      status: 'completed',
      'result.isEnrolled': true
    },
    { $set: { 'result.enrolledAt': new Date() } },
    { new: true }
  )
  if (claimed) {
    // 已经被 claim 过, 走幂等: 查 lead.convertedStudent
    const lead = await Lead.findOne({ preStudent: claimed.preStudent, org: orgId }).lean()
    if (lead && lead.convertedStudent) {
      return { idempotent: true, lead }
    }
    // claim 是的但 lead 还没写完 (并发中), 让前端重试
    throw ApiError.unprocessable('正在转化中, 请稍后重试')
  }
  // 二次校验: 真的没被 claim 且 status=completed 且 isEnrolled=true
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (doc.status !== 'completed') throw ApiError.badRequest('仅 completed 状态可转化')
  if (doc.result?.isEnrolled !== true) {
    throw ApiError.badRequest('result.isEnrolled 必须为 true 才可转化')
  }
  // 真正执行翻转 (覆盖上面已 claim 的检查, 因为上面查 isEnrolled=true 是必要条件)
  const flipped = await TrialBooking.findOneAndUpdate(
    { _id: id, org: orgId, 'result.isEnrolled': true, 'result.enrolledAt': null },
    { $set: { 'result.enrolledAt': new Date() } },
    { new: true }
  )
  if (!flipped) {
    throw ApiError.unprocessable('已转化, 幂等返回')
  }

  // Step 2: 拿 lead
  const lead = await Lead.findOne({ _id: flipped.preStudent, org: orgId })
  if (!lead) throw ApiError.notFound('潜客不存在')
  if (lead.convertedStudent) {
    // 极端竞态: lead 已 convert, 但 enrolledAt 被另一个并发写入
    return { idempotent: true, lead: lead.toObject() }
  }

  // Step 3: User upsert (findOneAndUpdate + $setOnInsert)
  const passwordHash = await password.hash(lead.phone.slice(-6))
  const user = await User.findOneAndUpdate(
    { mobile: lead.phone },
    {
      $setOnInsert: {
        mobile: lead.phone,
        passwordHash,
        realName: `家长-${lead.name}`,
        requirePasswordChange: true,
        isActive: true,
        isBlocked: false
      }
    },
    { upsert: true, new: true }
  )

  // Step 4: UserOrgRel upsert (找 家长 position)
  const parentPos = await Position.findOne({ org: orgId, name: '家长' }).select('_id').lean()
  if (!parentPos) throw ApiError.unprocessable('未找到「家长」系统职位, 请先初始化机构')
  await UserOrgRel.findOneAndUpdate(
    { user: user._id, org: orgId },
    { $setOnInsert: { user: user._id, org: orgId, positions: [parentPos._id], isMain: true } },
    { upsert: true, new: true }
  )

  // Step 5: Student create
  const student = await Student.create({
    org: orgId,
    name: lead.name,
    gender: lead.gender,
    school: lead.school || null,
    grade: lead.grade || '',
    className: lead.className || '',
    guardianUser: user._id,
    guardians: [user._id],
    isActive: true
  })

  // Step 6: Lead 写回
  lead.status = 'converted'
  lead.convertedStudent = student._id
  lead.convertedUser = user._id
  lead.convertedAt = new Date()
  lead.convertedRemark = flipped.result?.attractionPoint || ''
  await lead.save()

  return {
    idempotent: false,
    initialPassword: lead.phone.slice(-6),
    user: { id: String(user._id), mobile: user.mobile, realName: user.realName, requirePasswordChange: true },
    student: { id: String(student._id), name: student.name, school: student.school, grade: student.grade, className: student.className },
    lead: lead.toObject(),
    undoWindowMs: 5 * 60 * 1000
  }
}

/* ─── 物理删除 (高风险) ──────────────────────────── */

function trialBookingUsageChecks(orgId, bookingId) {
  return [
    {
      // 试听消费过课时? 试听本不参与消课; 但若以后扩展, completed 阻
      model: TrialBooking,
      filter: { _id: bookingId, org: orgId, status: 'completed' },
      label: '已完成', hint: '已完成的试听不可物理删除, 请联系超管'
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
