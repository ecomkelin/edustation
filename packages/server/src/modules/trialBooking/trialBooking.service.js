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

async function list({ orgId, status, from, to, teacher, subject, preStudent, parent, attemptNo, isEnrolled, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (status) {
    const arr = String(status).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 1) filter.status = { $in: arr }
    else if (arr.length === 1) filter.status = arr[0]
  }
  // 2026-06-16: 已完成按"已报名/未报名"分桶
  //   - isEnrolled=true  → 已报名 (result.isEnrolled === true)
  //   - isEnrolled=false → 未报名 (result.isEnrolled === false 或 null, 业务上"未填 = 未报名")
  if (isEnrolled === 'true') filter['result.isEnrolled'] = true
  else if (isEnrolled === 'false') filter['result.isEnrolled'] = { $in: [false, null] }
  if (teacher) filter.teacher = teacher
  if (subject) filter.subject = subject
  if (preStudent) filter.preStudent = preStudent
  if (parent) filter.parent = parent
  if (attemptNo) filter.attemptNo = Number(attemptNo)
  if (from || to) {
    // 2026-06-16: 日期过滤只对有 scheduledAt 的 booking 生效;
    //   - 'awaiting_schedule' 状态的 booking 没有 scheduledAt (还没排课),
    //     用 $gte/$lte 会把它滤掉 (条件永远 false)
    //   - 修法: 用 $or 包一层,scheduledAt 缺失的记录不参与日期判断
    const range = {}
    if (from) range.$gte = new Date(from)
    if (to) range.$lte = new Date(to)
    filter.$or = [
      { scheduledAt: range },
      { scheduledAt: { $exists: false } },
      { scheduledAt: null }
    ]
  }
  const [items, total] = await Promise.all([
    TrialBooking.find(filter)
      .populate('preStudent', 'name age gender grade className school trialSubject inviteTeacher')
      .populate({
        // 2026-06-16: 列表关联家长电话 + 邀约人 (前端 row.preStudent.parent.phone / .inviteTeacher.realName)
        //   preStudent 是 ChildLead, phone 在 Parent 上, inviteTeacher 是 User id
        //   必须二次 populate, 否则前端拿不到 realName/phone
        path: 'preStudent',
        populate: [
          { path: 'parent', select: 'phone lifecycle' },
          { path: 'inviteTeacher', select: 'mobile realName' }
        ]
      })
      .populate('parent', 'phone lifecycle')
      .populate('subject', 'name')
      .populate('teacher', 'mobile realName')  // 2026-06-16: 修复 — 列表试听老师列一直显示 "-"
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
        status: 'scheduled',
        // 2026-06-16: 修老 bug — 之前前端填的备注被丢
        //   - 接受 notes (BatchScheduleDialog 字段名) 或 remark (统一别名), 任一即可
        ...(body.notes !== undefined || body.remark !== undefined
          ? { remark: body.notes ?? body.remark ?? '' }
          : {})
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

/* ─── 改预约时间 (scheduled → scheduled, 仅改 scheduledAt/teacher/room) ─── */
/**
 * 2026-06-16 调整:
 *   - 删 no_show 后, 销售对"已约但人没来/想换时间" 的处理从"标未到 → 再约一次" 改成
 *     直接改预约时间 / 取消 (cancelled) / 退回未约 (awaiting_schedule)
 *   - 已约态调整不走"老 booking 留作审计 + 新建一笔 attemptNo+1" 路径, 避免历史越来越乱
 *   - 仅改 scheduledAt / teacher / room / scheduledDuration, 不改其他业务字段
 *   - 业务校验: 仅 scheduled 状态可改时间
 */
async function rescheduleTime({ id, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (doc.status !== 'scheduled') {
    throw ApiError.badRequest(`仅 scheduled 状态可改预约时间, 当前 ${doc.status}`)
  }
  const start = body.plannedStartTime ? new Date(body.plannedStartTime) : null
  const end = body.plannedEndTime ? new Date(body.plannedEndTime) : null
  if (start && end && !(start < end)) {
    throw ApiError.badRequest('开始时间必须早于结束时间')
  }
  if (start) doc.scheduledAt = start
  if (start && end) {
    // 同步 scheduledDuration (分钟), 跟 batchSchedule 计算口径一致
    doc.scheduledDuration = Math.round((end - start) / 60000)
  } else if (end && doc.scheduledAt) {
    doc.scheduledDuration = Math.round((end - doc.scheduledAt) / 60000)
  }
  if (body.teacher) doc.teacher = body.teacher
  if (body.room !== undefined) doc.room = body.room || null
  await doc.save()
  return doc.toObject()
}

/* ─── 退回到未约 (scheduled → awaiting_schedule) ─── */
/**
 * 2026-06-16 调整:
 *   - 销售在"已约" tab 看到一笔计划但又想从"批量排课" 池子里重新挑老师/时间时, 可退回
 *   - 退回后 status=awaiting_schedule, lessonSchedule 清空 (跟 awaiting_schedule 一致)
 *   - 业务校验: 仅 scheduled 可退; 退回后该 booking 会出现在"待约" tab 顶部 (按 createdAt 排)
 */
async function revertToUnscheduled({ id, orgId, currentUser }) {
  if (!currentUser) throw ApiError.unauthorized()
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (doc.status !== 'scheduled') {
    throw ApiError.badRequest(`仅 scheduled 状态可退回未约, 当前 ${doc.status}`)
  }
  doc.status = 'awaiting_schedule'
  doc.lessonSchedule = null
  // 不清 scheduledAt / teacher / room, 销售退回时保留原 hint;
  // 重新走 batchSchedule 时会被覆盖; 跟"从未排过" 不严格区分, 业务上没问题
  await doc.save()
  return doc.toObject()
}

/* ─── 取消后"再约一次" (cancelled → 新 awaiting_schedule + 走 batchSchedule) ─── */
/**
 * 2026-06-16: 销售在 cancelled tab 找到之前的预约, 想为同一孩子创建新一笔预约
 *   - 旧 booking 留作审计 (status 仍 cancelled, 业务可追溯)
 *   - 算新 attemptNo = max + 1
 *   - 创建一笔 awaiting_schedule 的新 booking, 继承旧 booking 的 subject
 *   - 写一条 LeadActivity 记录"第 N 次取消, 重新约第 M 次"
 *   - 内部调 batchSchedule, 直接走通排课 (起 teacher/room/start/end 校验)
 *   - 业务校验: 仅 cancelled 可触发 (scheduled 应该用 rescheduleTime; awaiting_schedule 直接 batchSchedule)
 */
async function rescheduleFromCancelled({ id, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const oldBooking = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!oldBooking) throw ApiError.notFound('试听预约不存在')
  if (oldBooking.status !== 'cancelled') {
    throw ApiError.badRequest(`仅 cancelled 状态可触发再约一次, 当前: ${oldBooking.status}`)
  }
  // 校验入参 (复用 batchSchedule 的口径)
  const start = new Date(body.plannedStartTime)
  const end = new Date(body.plannedEndTime)
  if (!(start < end)) throw ApiError.badRequest('开始时间必须早于结束时间')
  if (!body.teacher) throw ApiError.badRequest('teacher 必填')
  if (body.room && !await Room.exists({ _id: body.room, org: orgId })) {
    throw ApiError.badRequest('room 不属于本机构')
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
    remark: `第 ${oldBooking.attemptNo} 次取消, 重新约第 ${newAttempt} 次`
  })

  // 新建一笔 awaiting_schedule, 继承 subject
  const newBooking = await TrialBooking.create({
    org: orgId,
    preStudent: oldBooking.preStudent,
    parent: oldBooking.parent,
    attemptNo: newAttempt,
    joinMode: 'solo',
    subject: oldBooking.subject,
    status: 'awaiting_schedule',
    createdBy: currentUser.id,
    remark: `由 ${id} (第 ${oldBooking.attemptNo} 次取消) 再约产生`
  })

  // 走 batchSchedule 一次性排课
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
      // 2026-06-16: 改"首孩转化时的 realName 命名" — 按第一个转化的孩子的名字
      //   - 老版: 家长-${phone.slice(-4)} (手机号后 4 位)
      //   - 新版: 家长-${child.name} (本次转化的孩子名字)
      //   - 业务语义: 首孩转化时建 User, realName 取该孩名字; 次孩转化时 parent.user 已存在,
      //     $setOnInsert 不会覆盖, 保持首孩名字 — 跟用户决策"按第一个转化的孩子的名字"对齐
      : { mobile: parent.phone, realName: `家长-${child.name}`, requirePasswordChange: true },
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
          // 2026-06-16: 改首孩命名 — 家长-{首孩名字}
          //   - 次孩转化时 parent.user 已存在, 该 if 分支跳过, realName 保持首孩名
          //   - 跟用户决策"按第一个转化的孩子的名字"对齐
          realName: `家长-${child.name}`,
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

  // Step 8: 1 家长带多孩, **不再自动 mark 其他孩子** (2026-06-16 设计调整)
  //   - 历史: 同 parent 下其他 ChildLead auto-mark 'converted' + '同家长其他孩子已报名'
  //   - 问题: 销售误以为 siblings 也真的建了 Student/账号, 实际只是状态跟着翻
  //   - 新规: 1 个孩子真的转化, 真的建 Student; 其他孩子保持当前状态
  //           销售需要哪个孩子正式建档, 就逐个走 convert 流程
  //   - 业务影响: lifecycle 重算从 "数 status=converted" 改回 "数 convertedStudent != null"
  //               (更精确, 避免虚高)

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
    undoWindowMs: 5 * 60 * 1000
  }
}

/* ─── 物理删除 (高风险) ──────────────────────────── */

/**
 * 试听预约的"互锁"检查:
 *   只有「已取消」状态的预约可以物理删除, 其余状态一律阻挡。
 *   - awaiting_schedule / scheduled / arrived / completed 都不可删 (2026-06-16 删 no_show)
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
  convertPreview, convert,
  // 2026-06-16: 删 reschedule (旧 no_show 路径); 加 rescheduleTime / revertToUnscheduled / rescheduleFromCancelled
  rescheduleTime, revertToUnscheduled, rescheduleFromCancelled,
  trialBookingUsageChecks
}
