'use strict'

const LessonAttendance = require('@models/LessonAttendance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const StudentProduct = require('@models/StudentProduct.model')
const CourseInstance = require('@models/CourseInstance.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const StudentWork = require('@models/StudentWork.model')
const ApiError = require('@utils/ApiError')
const { AttendanceStatus, LessonScheduleStatus, CourseEnrollmentStatus } = require('@shared/enums')
const { pickStudentProductFIFO, deductOneLesson } = require('./studentProductHelper')

/**
 * 状态机（仅说明，COMPLETED 路径必须由消课接口触发，避免误扣课时）：
 *   scheduled → checked_in → completed      (消课，扣 studentProduct 1 课时)
 *   scheduled → no_show / leave             (不扣课时)
 *   checked_in → no_show / leave            (不扣课时)
 */
const VALID_TRANSITIONS = {
  [AttendanceStatus.SCHEDULED]: [
    AttendanceStatus.CHECKED_IN, AttendanceStatus.NO_SHOW, AttendanceStatus.LEAVE
  ],
  [AttendanceStatus.CHECKED_IN]: [
    AttendanceStatus.COMPLETED, AttendanceStatus.NO_SHOW, AttendanceStatus.LEAVE
  ]
}

// AUTO 路径白名单：仅供「结束上课时批量消课」使用，
// 允许 scheduled → completed，跳过中间签到。
// 不动 VALID_TRANSITIONS 是为了保留对外部「complete」单条接口的语义不变。
const VALID_TRANSITIONS_AUTO = {
  [AttendanceStatus.SCHEDULED]: [
    AttendanceStatus.COMPLETED, AttendanceStatus.NO_SHOW, AttendanceStatus.LEAVE
  ]
}

function assertTransition(from, to) {
  if (!VALID_TRANSITIONS[from] || !VALID_TRANSITIONS[from].includes(to)) {
    throw ApiError.badRequest(`状态 ${from} → ${to} 不允许`)
  }
}

function assertTransitionAuto(from, to) {
  if (!VALID_TRANSITIONS_AUTO[from] || !VALID_TRANSITIONS_AUTO[from].includes(to)) {
    throw ApiError.badRequest(`状态 ${from} → ${to} 不允许（AUTO 路径）`)
  }
}

// 排课处于这些状态时，考勤完全只读（不能改状态 / 课评 / 备注）
const READONLY_SCHEDULE_STATUSES = [
  LessonScheduleStatus.ARCHIVED,
  LessonScheduleStatus.CANCELLED
]

async function list({ orgId, lessonSchedule, courseInstance, student, status }) {
  const filter = { org: orgId }
  // courseInstance: 走 lessonSchedule.courseInstance 二级关联过滤（前端选课程→学生→考勤时使用）
  if (courseInstance) {
    const scheduleIds = await LessonSchedule.find({ org: orgId, courseInstance }).select('_id').lean()
    const ids = scheduleIds.map((s) => s._id)
    if (ids.length === 0) {
      return [] // 该课程下还没有排课，直接返回空
    }
    filter.lessonSchedule = { $in: ids }
  } else if (lessonSchedule) {
    filter.lessonSchedule = lessonSchedule
  }
  if (student) filter.student = student
  if (status) filter.status = status
  return LessonAttendance.find(filter)
    .populate('student', 'name')
    .populate('studentProduct', 'remainingLessons totalLessons expireDate isActive source giftReason giftedBy giftedAt')
    .populate('lessonSchedule', 'plannedStartTime title lessonNo')
    .sort({ createdAt: -1 })
    .lean()
}

/**
 * 签到：考勤记录在排课创建时已经预生成，签到仅做状态变更。
 * 若 body 传入 studentProduct，可替换该考勤的扣课产品（边缘场景：学生新购入产品）。
 */
async function checkIn({ orgId, id, studentProduct, remark }) {
  const att = await LessonAttendance.findOne({ _id: id, org: orgId })
  if (!att) throw ApiError.notFound('考勤记录不存在')
  assertTransition(att.status, AttendanceStatus.CHECKED_IN)

  let spId = att.studentProduct
  if (studentProduct) {
    const sp = await StudentProduct.findOne({ _id: studentProduct, org: orgId, student: att.student }).lean()
    if (!sp) throw ApiError.badRequest('学生持有的产品不匹配')
    if (!sp.isActive) throw ApiError.unprocessable('学生持有的产品已停用')
    if (sp.remainingLessons <= 0) throw ApiError.unprocessable('学生持有的产品剩余课时为 0')
    if (new Date(sp.expireDate).getTime() < Date.now()) throw ApiError.unprocessable('学生持有的产品已过期')
    spId = sp._id
  }

  att.status = AttendanceStatus.CHECKED_IN
  att.studentProduct = spId
  att.actualStartTime = new Date()
  if (remark !== undefined) att.remark = remark
  await att.save()
  return att.toObject()
}

/**
 * 消课：状态 → completed，扣 studentProduct.remainingLessons。
 * 若考勤在排课时没有预选到有效产品，studentProduct 为空，需先签到补上。
 */
async function complete({ id, orgId, actualEndTime, remark, studentProduct }) {
  const att = await LessonAttendance.findOne({ _id: id, org: orgId })
  if (!att) throw ApiError.notFound('考勤记录不存在')
  assertTransition(att.status, AttendanceStatus.COMPLETED)

  // 解析最终扣课的产品：body > 已有
  let spId = studentProduct || att.studentProduct
  if (!spId) throw ApiError.unprocessable('该考勤未绑定学生产品，请先签到或传入 studentProduct')

  const sp = await StudentProduct.findById(spId)
  if (!sp) throw ApiError.badRequest('学生持有的产品不存在')
  if (sp.student.toString() !== att.student.toString()) {
    throw ApiError.badRequest('产品不属于该学生')
  }
  if (sp.remainingLessons <= 0) throw ApiError.unprocessable('学生持有的产品剩余课时为 0')

  sp.remainingLessons -= 1
  if (sp.remainingLessons === 0) sp.isActive = false
  await sp.save()

  att.status = AttendanceStatus.COMPLETED
  att.studentProduct = sp._id
  att.actualEndTime = actualEndTime ? new Date(actualEndTime) : new Date()
  if (remark !== undefined) att.remark = remark
  await att.save()
  return {
    attendance: att.toObject(),
    studentProduct: {
      id: sp._id,
      remainingLessons: sp.remainingLessons,
      isActive: sp.isActive
    }
  }
}

/**
 * 未到 / 请假：不扣课时
 */
async function markStatus({ id, orgId, toStatus, remark }) {
  if (![AttendanceStatus.NO_SHOW, AttendanceStatus.LEAVE].includes(toStatus)) {
    throw ApiError.badRequest('该接口仅支持 no_show / leave')
  }
  const att = await LessonAttendance.findOne({ _id: id, org: orgId })
  if (!att) throw ApiError.notFound('考勤记录不存在')
  assertTransition(att.status, toStatus)
  att.status = toStatus
  if (remark !== undefined) att.remark = remark
  await att.save()
  return att.toObject()
}

/**
 * 批量「开课登记」：一次保存一节课所有学生的考勤状态。
 *
 * 用法：
 *   - 老师在「开课」抽屉里逐个勾选：正常 / 请假 / 迟到 / 未到
 *   - 调用本接口一次性写入；正常与迟到 → checked_in；请假 → leave；未到 → no_show
 *   - 仅做状态变更，**不扣课时**（扣课时走 complete 接口，由「消课」环节触发）
 *   - items 不存在的学生不会被改（前端只需把名单里出现的全部传上来）
 *
 * 边界：
 *   - 已 completed 的考勤不允许再开课登记（throw 400）
 *   - 仅允许这节课的考勤（org 校验 + lessonSchedule 校验）
 */
async function bulkMarkForLesson({ orgId, lessonSchedule, items }) {
  if (!lessonSchedule) throw ApiError.badRequest('lessonSchedule 必填')
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('items 必填且至少 1 项')
  }
  // 校验 lessonSchedule 归属 + 状态
  const sched = await LessonSchedule.findOne({ _id: lessonSchedule, org: orgId })
    .select('_id status').lean()
  if (!sched) throw ApiError.notFound('排课不存在')
  if (READONLY_SCHEDULE_STATUSES.includes(sched.status)) {
    throw ApiError.badRequest('已归档/已取消的排课不可修改考勤')
  }

  // 一次性查全部相关考勤
  const ids = items.map((it) => it.attendance).filter(Boolean)
  if (ids.length !== items.length) {
    throw ApiError.badRequest('items[*].attendance 必填')
  }
  const atts = await LessonAttendance.find({
    _id: { $in: ids },
    org: orgId,
    lessonSchedule
  })
  if (atts.length !== ids.length) {
    throw ApiError.badRequest('存在不归属本排课的考勤')
  }

  // 目标状态映射：前端 UI 状态 → 考勤状态
  const NORMAL_STATUSES = [
    AttendanceStatus.CHECKED_IN,
    AttendanceStatus.NO_SHOW,
    AttendanceStatus.LEAVE
  ]

  const now = new Date()
  const byId = new Map(atts.map((a) => [String(a._id), a]))
  const results = []
  for (const it of items) {
    const att = byId.get(String(it.attendance))
    if (!att) continue
    const target = it.status
    if (!NORMAL_STATUSES.includes(target)) {
      throw ApiError.badRequest(`不支持的状态：${target}`)
    }
    if (att.status === AttendanceStatus.COMPLETED) {
      throw ApiError.badRequest('已完成消课的考勤不可再修改')
    }
    att.status = target
    if (target === AttendanceStatus.CHECKED_IN) {
      // 正常 / 迟到 → 写入 actualStartTime（如尚未写）
      if (!att.actualStartTime) att.actualStartTime = now
    }
    if (it.remark !== undefined) att.remark = it.remark
    await att.save()
    results.push(att.toObject())
  }
  return results
}

async function works({ id, orgId }) {
  const att = await LessonAttendance.findOne({ _id: id, org: orgId }).lean()
  if (!att) throw ApiError.notFound('考勤记录不存在')
  return StudentWork.find({ org: orgId, lessonAttendance: att._id })
    .populate('student', 'name')
    .populate('uploadedBy', 'realName mobile')
    .sort({ createdAt: -1 })
    .lean()
}

/**
 * 写入/更新结构化课评。
 * 业务规则：
 *   - 仅当 attendance.status === 'completed' 或 'madeup' 允许写入（未消课 / 请假 / 未到 不写课评）；
 *   - 课评内容全部可选：score / content / strengths / improvements 任意子集；
 *   - 写 evaluatedBy = req.user.id, evaluatedAt = now()；
 *   - 允许"分段保存"，每次只带一个字段也 OK；
 *   - score 范围 1-5，null 表示清除评分。
 */
async function updateEvaluation({ id, orgId, actorId, patch }) {
  const att = await LessonAttendance.findOne({ _id: id, org: orgId })
  if (!att) throw ApiError.notFound('考勤记录不存在')
  if (att.status !== AttendanceStatus.COMPLETED && att.status !== AttendanceStatus.MADEUP) {
    throw ApiError.badRequest('仅「已消课/已补」的考勤可写课评')
  }
  // 排课归档 / 取消后不可改课评
  const sched = await LessonSchedule.findOne({ _id: att.lessonSchedule, org: orgId })
    .select('status').lean()
  if (sched && READONLY_SCHEDULE_STATUSES.includes(sched.status)) {
    throw ApiError.badRequest('已归档/已取消的排课不可修改课评')
  }
  const evalDoc = att.evaluation || {}
  if (patch.score !== undefined) {
    if (patch.score !== null && (patch.score < 1 || patch.score > 5)) {
      throw ApiError.badRequest('score 必须在 1-5 之间')
    }
    evalDoc.score = patch.score
  }
  if (patch.content !== undefined) evalDoc.content = patch.content
  if (patch.strengths !== undefined) evalDoc.strengths = patch.strengths
  if (patch.improvements !== undefined) evalDoc.improvements = patch.improvements
  evalDoc.evaluatedBy = actorId
  evalDoc.evaluatedAt = new Date()
  att.evaluation = evalDoc
  await att.save()
  return att.toObject()
}

/**
 * 「结束上课」时自动批量消课并扣 StudentProduct。
 *
 * 业务规则：
 *   - 仅当排课处于 in_progress / completed 时允许触发（防御性）
 *   - 每条考勤按以下规则处理：
 *       completed      → 跳过（幂等：之前手动消过的）
 *       leave/no_show  → 跳过（不扣课时；保留备注用于后续补课标记）
 *       scheduled/checked_in → 自动消课（completed）+ 扣 1 课时
 *   - 扣减走 deductOneLesson 原子操作（findOneAndUpdate + $inc + $gte），并发安全
 *   - 无可用课包 / 余额已被并发扣完 → 进 failed 数组，不阻断其他人
 *   - 返回 { consumed, skipped, failed } 三段明细，controller 透传给前端用于 toast
 */
async function bulkCompleteForSchedule({ orgId, lessonSchedule }) {
  const sched = await LessonSchedule.findOne({ _id: lessonSchedule, org: orgId })
    .select('_id status courseInstance actualEndTime').lean()
  if (!sched) throw ApiError.notFound('排课不存在')
  if (![LessonScheduleStatus.IN_PROGRESS, LessonScheduleStatus.COMPLETED].includes(sched.status)) {
    throw ApiError.badRequest('仅「进行中/已结束」的排课可触发自动消课')
  }

  const atts = await LessonAttendance.find({ org: orgId, lessonSchedule }).lean()
  if (!atts.length) return { consumed: [], skipped: [], failed: [] }

  // 取 CourseInstance.acceptedCourseProducts（默认 [courseProduct]）
  const inst = await CourseInstance.findById(sched.courseInstance)
    .select('acceptedCourseProducts courseProduct').lean()
  const accepted = (inst && inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
    ? inst.acceptedCourseProducts
    : (inst ? [inst.courseProduct] : [])

  const consumed = []
  const skipped = []
  const failed = []
  const now = new Date()

  for (const att of atts) {
    // 已 completed 跳过（幂等：之前手动消过课的考勤不重复扣）
    if (att.status === AttendanceStatus.COMPLETED) {
      skipped.push({ attendance: att._id, reason: 'already_completed' })
      continue
    }
    // 已 madeup 跳过（幂等：补课创建时已扣过课时；防御性，正常不会在 in_progress 出现）
    if (att.status === AttendanceStatus.MADEUP) {
      skipped.push({ attendance: att._id, reason: 'already_madeup' })
      continue
    }
    // leave / no_show 不动（不扣课时）
    if (att.status === AttendanceStatus.LEAVE || att.status === AttendanceStatus.NO_SHOW) {
      skipped.push({ attendance: att._id, reason: att.status })
      continue
    }
    // scheduled / checked_in → completed（AUTO 白名单校验）
    assertTransitionAuto(att.status, AttendanceStatus.COMPLETED)

    // 选包：优先用考勤原绑定的 studentProduct，没有则按 FIFO 重新选
    let spId = att.studentProduct
    if (!spId) {
      const picked = await pickStudentProductFIFO({ orgId, student: att.student, accepted, now })
      if (!picked) {
        failed.push({ attendance: att._id, student: att.student, reason: 'no_available_product' })
        continue
      }
      spId = picked._id
    }

    // 原子扣减 1 课时（并发安全）
    const updated = await deductOneLesson(spId)
    if (!updated) {
      // 余额在并发中被扣完 / 产品已过期停用 → 标 failed，不阻断
      failed.push({ attendance: att._id, student: att.student, reason: 'product_exhausted' })
      continue
    }

    // 写考勤
    const toUpdate = await LessonAttendance.findById(att._id)
    toUpdate.status = AttendanceStatus.COMPLETED
    toUpdate.studentProduct = spId
    toUpdate.actualEndTime = sched.actualEndTime || now
    await toUpdate.save()
    consumed.push({
      attendance: toUpdate._id,
      student: att.student,
      studentProduct: spId,
      remainingLessons: updated.remainingLessons
    })
  }

  return { consumed, skipped, failed }
}

/**
 * 为该开班下所有 plannedStartTime >= now 且 status ∈ {scheduled, preparing, in_progress} 的排课，
 * 给指定学生补一条 LessonAttendance（若不存在）。
 *
 * 用于：courseEnrollment.create / studentProduct.create / order.service.pay 后触发。
 * 只补"未来"的考勤，不补历史——过去的课由"补排课 + 转班"流程处理。
 */
async function ensureAttendanceForStudent({ orgId, student, courseInstance }) {
  const now = new Date()
  const schedules = await LessonSchedule.find({
    org: orgId,
    courseInstance,
    plannedStartTime: { $gte: now },
    status: { $in: [
      LessonScheduleStatus.SCHEDULED,
      LessonScheduleStatus.PREPARING,
      LessonScheduleStatus.IN_PROGRESS
    ] }
  }).select('_id').lean()
  if (!schedules.length) return { created: 0, skipped: 0 }

  const inst = await CourseInstance.findById(courseInstance)
    .select('acceptedCourseProducts courseProduct').lean()
  if (!inst) return { created: 0, skipped: schedules.length }
  const accepted = (inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
    ? inst.acceptedCourseProducts
    : [inst.courseProduct]

  // 先查已存在的考勤，避免重复
  const existing = await LessonAttendance.find({
    org: orgId,
    student,
    lessonSchedule: { $in: schedules.map((s) => s._id) }
  }).select('lessonSchedule').lean()
  const existingSet = new Set(existing.map((e) => String(e.lessonSchedule)))

  const docs = []
  for (const sched of schedules) {
    if (existingSet.has(String(sched._id))) continue
    const picked = await pickStudentProductFIFO({ orgId, student, accepted, now })
    if (!picked) continue // 无可用产品：跳过（同 generateAttendancesForSchedule 语义）
    docs.push({
      org: orgId,
      lessonSchedule: sched._id,
      student,
      studentProduct: picked._id,
      status: AttendanceStatus.SCHEDULED
    })
  }
  if (!docs.length) {
    return { created: 0, skipped: schedules.length }
  }
  await LessonAttendance.insertMany(docs, { ordered: false })
  return { created: docs.length, skipped: schedules.length - docs.length }
}

/**
 * 教务「手动添加」单条 LessonAttendance。
 *
 * 业务场景：
 *   - 「准备上课」时按 enrolled + 有效课包批量生成了考勤，但业务上不排除：
 *     ① 学生在 generating 之后才补报名进来（应走 ensureAttendanceForStudent，不走这个）；
 *     ② 学生后续购了新课包，原来因"无课包"未生成考勤，现在需要补一条；
 *     ③ 教务手动调整名单（极个别场景）。
 *   - 本接口允许教务在不依赖 prepare() / ensureAttendanceForStudent 的情况下，
 *     主动为某个学生在本排课上"补一条考勤"。
 *
 * 业务规则：
 *   - 排课必须存在、属于本机构、未归档 / 未取消；
 *   - 学生必须对该开班处于 enrolled 状态（防止给已退班学生建考勤）；
 *   - 同一 (lessonSchedule, student) 只能有一条考勤（用唯一索引 + 兜底 400 提示）；
 *   - studentProduct：可空（管理端兜底逻辑：若不传且本开班能 FIFO 选到合法产品则预选上，
 *     否则置 null，消课时再补）；
 *   - status：仅允许 'scheduled'（新增时的默认）；其他状态（checked_in/leave/no_show/
 *     completed）请走对应业务接口（签到 / 批量登记 / 消课），不在本接口处理。
 */
async function addManual({ orgId, lessonSchedule, student, studentProduct, remark }) {
  const sched = await LessonSchedule.findOne({ _id: lessonSchedule, org: orgId })
    .select('_id status courseInstance').lean()
  if (!sched) throw ApiError.notFound('排课不存在')
  if (READONLY_SCHEDULE_STATUSES.includes(sched.status)) {
    throw ApiError.badRequest('已归档/已取消的排课不可手动添加考勤')
  }

  // 学生必须是本开班 enrolled
  const enrollment = await CourseEnrollment.findOne({
    org: orgId,
    courseInstance: sched.courseInstance,
    student,
    status: CourseEnrollmentStatus.ENROLLED
  }).select('_id').lean()
  if (!enrollment) {
    throw ApiError.badRequest('该学生未报名本开班，无法添加考勤')
  }

  // 已存在则直接报错（不覆盖 / 不更新）
  const existing = await LessonAttendance.findOne({
    org: orgId,
    lessonSchedule,
    student
  }).select('_id status').lean()
  if (existing) {
    throw ApiError.unprocessable('该学生在本排课已有考勤记录', {
      attendance: String(existing._id),
      status: existing.status
    })
  }

  // 解析 studentProduct：body 显式传 > 不传则按 FIFO 自动预选
  let spId = studentProduct || null
  if (!spId) {
    const inst = await CourseInstance.findById(sched.courseInstance)
      .select('acceptedCourseProducts courseProduct').lean()
    const accepted = (inst && inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
      ? inst.acceptedCourseProducts
      : (inst ? [inst.courseProduct] : [])
    const picked = await pickStudentProductFIFO({ orgId, student, accepted })
    if (picked) spId = picked._id
    // 没有可用的也允许：保持 studentProduct=null（消课时再补）
  } else {
    // 校验：传了 studentProduct 必须属于该学生 + 在本开班 acceptedCourseProducts 范围内
    const sp = await StudentProduct.findOne({ _id: spId, org: orgId, student }).lean()
    if (!sp) throw ApiError.badRequest('该学生未持有此产品')
    const inst = await CourseInstance.findById(sched.courseInstance)
      .select('acceptedCourseProducts courseProduct').lean()
    const accepted = (inst && inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
      ? inst.acceptedCourseProducts
      : (inst ? [inst.courseProduct] : [])
    if (!accepted.map(String).includes(String(sp.courseProduct))) {
      throw ApiError.badRequest('该产品不在本开班可接受的课程产品范围内')
    }
  }

  const doc = await LessonAttendance.create({
    org: orgId,
    lessonSchedule,
    student,
    studentProduct: spId,
    status: AttendanceStatus.SCHEDULED,
    remark: remark || undefined
  })
  return doc.toObject()
}

/**
 * 「补课」（2026-06 改为「就地转状态」语义）：
 *
 * 业务语义：
 * - 把原考勤的就地 status 从 leave / no_show / scheduled / checked_in 翻成 madeup；
 * - FIFO 选 StudentProduct 原子扣 1 课时，扣减结果挂到原考勤.studentProduct；
 * - 原考勤保留（旧 status / 旧 remark 等写到 meta），用于审计"这次补课前的状态是什么";
 * - 不再创建新考勤（修正 2026-06 早期版本"建新行导致重复显示"的 UX 问题）。
 * - UI 上原条目直接变 "已补" 标签，操作列 "补课" 按钮自动隐藏。
 *
 * 调用入口：
 * - 上课表 ClassSchedulePage 已结束/已归档卡片展开名单里点「补课」；
 * - 独立「补课」页 MakeupPage 集中操作（跨课跨学生）。
 *
 * 业务校验：
 * - 原考勤必须存在、属于本机构；
 * - 原考勤 status !== 'completed' 且 status !== 'madeup'（已消课/已补无需再补）；
 * - 原排课处于 completed / archived（in_progress/scheduled/preparing 不允许补课）；
 * - 学生当前必须持有匹配 acceptedCourseProducts、未过期、remainingLessons>0 的产品。
 *
 * @returns { attendance, studentProduct } 更新后的原考勤 + 扣减后的产品摘要
 */
async function makeup({ id, orgId, actualStartTime, actualEndTime, remark }) {
 const orig = await LessonAttendance.findOne({ _id: id, org: orgId })
 if (!orig) throw ApiError.notFound('考勤记录不存在')
 if (orig.status === AttendanceStatus.COMPLETED || orig.status === AttendanceStatus.MADEUP) {
 throw ApiError.badRequest('已消课/已补的考勤无需再补')
 }
 const sched = await LessonSchedule.findOne({ _id: orig.lessonSchedule, org: orgId })
 .select('_id status courseInstance actualStartTime actualEndTime')
 if (!sched) throw ApiError.notFound('原排课不存在')
 if (![LessonScheduleStatus.COMPLETED, LessonScheduleStatus.ARCHIVED].includes(sched.status)) {
 throw ApiError.badRequest('仅「已结束/已归档」的排课可补课')
 }
 const inst = await CourseInstance.findById(sched.courseInstance)
 .select('acceptedCourseProducts courseProduct')
 const accepted = (inst && inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
 ? inst.acceptedCourseProducts
 : (inst ? [inst.courseProduct] : [])
 if (!accepted.length) {
 throw ApiError.unprocessable('本开班未配置可接受的课程产品，无法补课')
 }
 const picked = await pickStudentProductFIFO({ orgId, student: orig.student, accepted })
 if (!picked) {
 throw ApiError.unprocessable('该学生当前无任何可用的课包（已过期或剩余0）')
 }
 const updatedSp = await deductOneLesson(picked._id)
 if (!updatedSp) {
 throw ApiError.unprocessable('课包扣减失败，可能并发已扣完')
 }
 // ★就地转状态：把原考勤 status 翻成 madeup；meta 保留"原状态/原备注/补课时间"用于审计
 const now = new Date()
 // 在改 status 之前先把原状态写到 meta，保留"补课前是什么状态"
 const prevStatus = orig.status
 const prevMeta = orig.meta || {}
 orig.status = AttendanceStatus.MADEUP
 orig.studentProduct = updatedSp._id
 orig.actualStartTime = actualStartTime ? new Date(actualStartTime) : (sched.actualStartTime || now)
 orig.actualEndTime = actualEndTime ? new Date(actualEndTime) : (sched.actualEndTime || now)
 if (remark !== undefined) orig.remark = remark
 orig.meta = {
 ...prevMeta,
 originalStatus: prevStatus, // 记录"补课前是什么状态"
 makeupAt: now
 }
 await orig.save()
 return {
 attendance: orig.toObject(),
 studentProduct: {
 id: updatedSp._id,
 remainingLessons: updatedSp.remainingLessons,
 isActive: updatedSp.isActive
 }
 }
}

module.exports = {
  list,
  checkIn,
  complete,
  markStatus,
  bulkMarkForLesson,
  works,
  updateEvaluation,
  bulkCompleteForSchedule,
  ensureAttendanceForStudent,
  addManual,
 makeup
}
