'use strict'

const mongoose = require('mongoose')
const TrialBooking = require('@models/TrialBooking.model')
const ChildLead = require('@models/ChildLead.model')
const Parent = require('@models/Parent.model')
const LeadActivity = require('@models/LeadActivity.model')
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

async function list({ orgId, status, from, to, teacher, subject, preStudent, parent, attemptNo, ageMin, ageMax, isEnrolled, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (status) {
    const arr = String(status).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 1) filter.status = { $in: arr }
    else if (arr.length === 1) filter.status = arr[0]
  }
  // 2026-06-16: 已完成按"已报名/未报名"分桶
  //   - isEnrolled=true  → 已报名 (status=completed + result.isEnrolled === true)
  //   - isEnrolled=false → 未报名 (status=completed + result.isEnrolled ∈ [false, null])
  // 2026-06-20: considering 改走顶级 status 字段; isEnrolled 不再接受 'considering'
  if (isEnrolled === 'true') { filter.status = 'completed'; filter['result.isEnrolled'] = true }
  else if (isEnrolled === 'false') { filter.status = 'completed'; filter['result.isEnrolled'] = { $in: [false, null] } }
  if (teacher) filter.teacher = teacher
  if (subject) filter.subject = subject
  // 2026-06-18: 按孩子年龄过滤 (年龄段筛选)
  //   - age 字段在 ChildLead (preStudent) 上, 而 TrialBooking 只存 preStudent ObjectId
  //   - 做法: 先查 ChildLead 拿到匹配的 _id, 再用 $in 过滤 TrialBooking
  //   - age 跟 preStudent 互斥 (业务上前端不会同时用), 冲突时 age 优先 (粗筛)
  let preStudentFilter = preStudent || null
  if (ageMin != null || ageMax != null) {
    const ageQuery = { org: orgId, age: {} }
    if (ageMin != null) ageQuery.age.$gte = Number(ageMin)
    if (ageMax != null) ageQuery.age.$lte = Number(ageMax)
    const matchedIds = await ChildLead.find(ageQuery).select('_id').lean()
    const idList = matchedIds.map((d) => d._id)
    if (idList.length === 0) {
      return { items: [], total: 0, page: p.page, pageSize: p.pageSize }
    }
    // 如果用户同时传了 preStudent, 校验它是否在匹配的 idList 里
    if (preStudentFilter && !idList.some((id) => String(id) === String(preStudentFilter))) {
      return { items: [], total: 0, page: p.page, pageSize: p.pageSize }
    }
    preStudentFilter = preStudentFilter || { $in: idList }
  }
  if (preStudentFilter) filter.preStudent = preStudentFilter
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
      .populate('consultant', 'mobile realName')
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
    .populate('parent', 'phone lifecycle promoteBy')
    .populate('teacher', 'mobile realName')
    .populate('subject', 'name')
    .populate('consultant', 'mobile realName')
    .populate('createdBy', 'mobile realName')
    .lean()
  if (!b) throw ApiError.notFound('试听预约不存在')
  return b
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

/* ─── 为现有孩子创建一笔 awaiting_schedule 预约 (2026-06-20 新增) ─── */
/**
 * 业务场景:
 *   - 已取消 → 想再试
 *   - 已转化 → 想再试另一门
 *   - 录入时漏了某个科目, 现在想补
 *   - 老流程: 走 rescheduleFromCancelled 但只能从 cancelled 触发, 不通用
 *   - 新流程: 给已有 ChildLead 单独建一笔 awaiting_schedule booking
 *
 * 行为:
 *   - 算 attemptNo = max + 1
 *   - status = 'awaiting_schedule'
 *   - subject: 优先 body.subject → 回落 kid.trialSubject[0] → null
 *   - 不动 ChildLead.status (由后续 batchSchedule 翻到 scheduled)
 *   - 不写 LeadActivity (与 childLead.create 自动建 N 笔的口径一致; 业务上不算"触点", 是"新增预约")
 *
 * 2026-06-21: 删 joinMode 字段 (attached 模式下线, 试听课不再走排课系统)
 */
async function createForChild({ orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const child = await ChildLead.findOne({ _id: body.preStudent, org: orgId }).lean()
  if (!child) throw ApiError.badRequest('孩子潜客不存在')

  // subject 校验 (字典 model='Subject' 必须属于本机构)
  let subjectId = body.subject || null
  if (subjectId) {
    const Category = require('@models/Category.model')
    const exists = await Category.exists({ _id: subjectId, org: orgId, model: 'Subject' })
    if (!exists) throw ApiError.badRequest('试听科目不存在或不属于本机构')
  } else if (child.trialSubject) {
    // 回落: 孩子档案里的第一个 trialSubject
    subjectId = child.trialSubject
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
    subject: subjectId,
    status: 'awaiting_schedule',
    remark: body.remark || '',
    createdBy: currentUser.id
  })
  return detail(doc._id, orgId)
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
  // 2026-06-21: 删 joinMode 字段; 试听课时间/老师/教室直接存本 booking
  const updateResult = await TrialBooking.updateMany(
    { _id: { $in: body.bookingIds }, status: 'awaiting_schedule' },
    {
      $set: {
        scheduledAt: start,
        scheduledDuration: durationMinutes,
        teacher: body.teacher,
        room: body.room || null,
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

/* ─── 试听完成 / 考虑期 (2026-06-20 改造) ────────────────────────
 *  业务: 试听做完有 3 种结果
 *    1. completed + isEnrolled=true   报名 (后续触发 convert 流程)
 *    2. completed + isEnrolled=false  不报名
 *    3. considering                   考虑期 (谈单老师后续跟进, 跟进后再走 1/2)
 *
 *  触发规则 (后端推断 status, 不让前端传):
 *    - body.result.isEnrolled ∈ [true, false] → status='completed'
 *    - body.result.isEnrolled === null/undefined 且 body.result.considerNote 非空 → status='considering'
 *    - 已 considering, 二次调 complete 填 isEnrolled → status='completed' (跟进完成)
 *
 *  业务校验:
 *    - scheduled/arrived 状态 → 允许触发 (新流程)
 *    - considering 状态 → 允许触发 (跟进完成)
 *    - completed → 不允许 (避免覆盖已转化记录)
 *    - cancelled/awaiting_schedule → 不允许
 */
async function complete({ id, orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  const doc = await TrialBooking.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('试听预约不存在')
  if (!['arrived', 'scheduled', 'considering'].includes(doc.status)) {
    throw ApiError.badRequest(`仅 arrived / scheduled / considering 可完成, 当前 ${doc.status}`)
  }

  if (body.actualEndTime) doc.actualEndTime = new Date(body.actualEndTime)
  // 2026-06-21: 谈单老师统一走顶级 consultant 字段 (result.negotiateTeacher 已删)
  if (body.consultant !== undefined) doc.consultant = body.consultant
  if (body.result) {
    if (body.result.attractionPoint !== undefined) doc.result.attractionPoint = body.result.attractionPoint
    if (body.result.reasonNotEnrolled !== undefined) doc.result.reasonNotEnrolled = body.result.reasonNotEnrolled
    if (body.result.considerNote !== undefined) doc.result.considerNote = body.result.considerNote
    // 2026-06-21 新增: 考虑期 3 字段 (家长态度 + 孩子表现 + 话术准备)
    if (body.result.childNote !== undefined) doc.result.childNote = body.result.childNote
    if (body.result.followUpScript !== undefined) doc.result.followUpScript = body.result.followUpScript

    // 状态机: 根据入参决定翻 completed / considering / arrived (2026-06-21 修复)
    //   - isEnrolled === true|false  → "已定夺" → status=completed
    //   - isEnrolled === null + 当前 arrived   → 翻 considering (明确表达"未决, 进考虑期")
    //   - isEnrolled === null + 当前 considering → 保持 considering (改备注)
    //   - 其他 (arrived + 啥都没带) → 维持 arrived
    if (body.result.isEnrolled === true || body.result.isEnrolled === false) {
      // 已定夺: completed
      doc.result.isEnrolled = body.result.isEnrolled
      doc.status = 'completed'
    } else if (body.result.isEnrolled === null) {
      // 选"考虑中": arrived → considering; considering → 保持 considering
      doc.result.isEnrolled = null
      if (doc.status === 'arrived' || doc.status === 'scheduled') {
        doc.status = 'considering'
      }
      // 已 considering 则维持 (改备注/谈单老师, 不动 status)
    }
    // 其他场景: arrived + 啥都没带 → 维持 arrived (待定夺)
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
  list, detail, update, remove, removableCheck,
  createForChild, // 2026-06-20: 为已有 childLead 建一笔 awaiting_schedule booking
  batchSchedule, checkIn, complete,
  convertPreview, convert,
  // 2026-06-16: 删 reschedule (旧 no_show 路径); 加 rescheduleTime / revertToUnscheduled / rescheduleFromCancelled
  rescheduleTime, revertToUnscheduled, rescheduleFromCancelled,
  // 2026-06-21: 删 create (attached 跟班模式); 试听课完全独立于排课系统
  trialBookingUsageChecks
}
