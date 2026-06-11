'use strict'

const CourseInstance = require('@models/CourseInstance.model')
const CourseProduct = require('@models/CourseProduct.model')
const Subject = require('@models/Subject.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Room = require('@models/Room.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const courseEnrollmentService = require('../courseEnrollment/courseEnrollment.service')
const ApiError = require('@utils/ApiError')
const { CourseEnrollmentStatus, CourseInstanceStatus } = require('@shared/enums')

// ─── 锁字段规则（planning 之外不可改；totalPlannedLessons 例外） ───
// 业务上：非 planning 状态下，subject / name / minutesPerLesson 一旦确定就锁死，
// 因为改了会让已报名的家长/已排的课混乱。totalPlannedLessons 允许下调但不能上调，
// 且新值必须 >= 该开班下已创建的 LessonSchedule 数量（避免溢出）。
const STRICT_LOCKED_FIELDS = ['subject', 'name', 'minutesPerLesson']

/**
 * 预计结束日期（粗估，UI 展示用；真实排课由 LessonSchedule 决定）：
 *  - weekly 模式：startDate + ceil(totalPlannedLessons / lessonsPerWeek) * 7 天
 *  - cycle  模式：startDate + ceil(totalPlannedLessons / cycleOnDays) * (cycleOnDays + cycleOffDays) 天
 *  - 都没拿到必要字段：返回 null
 */
function computeEstimatedEndDate(startDate, schedulePlan) {
  if (!startDate || !schedulePlan) return null
  const { mode = 'weekly', totalPlannedLessons } = schedulePlan
  if (!totalPlannedLessons) return null

  let days
  if (mode === 'cycle') {
    const { cycleOnDays, cycleOffDays } = schedulePlan
    if (!cycleOnDays || !cycleOffDays) return null
    const cycleLen = Number(cycleOnDays) + Number(cycleOffDays)
    const cycles = Math.ceil(totalPlannedLessons / cycleOnDays)
    days = cycles * cycleLen
  } else {
    const { lessonsPerWeek } = schedulePlan
    if (!lessonsPerWeek) return null
    const weeks = Math.ceil(totalPlannedLessons / lessonsPerWeek)
    days = weeks * 7
  }

  const d = new Date(startDate)
  d.setDate(d.getDate() + days)
  return d
}

/**
 * 校验 schedulePlan 的 mode 与字段互斥：
 *  - weekly 必须给 lessonsPerWeek（restDays 可空）
 *  - cycle  必须给 cycleOnDays + cycleOffDays
 * 失败抛 ApiError.badRequest，由 create / update 复用。
 */
function assertSchedulePlanValid(schedulePlan) {
  if (!schedulePlan || typeof schedulePlan !== 'object') {
    throw ApiError.badRequest('schedulePlan 必填')
  }
  const mode = schedulePlan.mode || 'weekly'
  if (mode === 'weekly') {
    if (!Number.isInteger(schedulePlan.lessonsPerWeek) || schedulePlan.lessonsPerWeek < 1 || schedulePlan.lessonsPerWeek > 7) {
      throw ApiError.badRequest('weekly 模式：schedulePlan.lessonsPerWeek 必须是 1-7 的整数')
    }
  } else if (mode === 'cycle') {
    if (!Number.isInteger(schedulePlan.cycleOnDays) || schedulePlan.cycleOnDays < 1) {
      throw ApiError.badRequest('cycle 模式：schedulePlan.cycleOnDays 必须是 >= 1 的整数')
    }
    if (!Number.isInteger(schedulePlan.cycleOffDays) || schedulePlan.cycleOffDays < 1) {
      throw ApiError.badRequest('cycle 模式：schedulePlan.cycleOffDays 必须是 >= 1 的整数')
    }
  }
  if (!Number.isInteger(schedulePlan.totalPlannedLessons) || schedulePlan.totalPlannedLessons < 1) {
    throw ApiError.badRequest('schedulePlan.totalPlannedLessons 必须是 >= 1 的整数')
  }
  // weekly 下 totalPlannedLessons 应 >= lessonsPerWeek（cycle 下不强制）
  if (mode === 'weekly' && schedulePlan.totalPlannedLessons < schedulePlan.lessonsPerWeek) {
    throw ApiError.badRequest('schedulePlan.totalPlannedLessons 必须 >= lessonsPerWeek')
  }
}

async function list({ orgId, status, statuses, subject, teacher, room, keyword }) {
  const filter = { org: orgId, deletedAt: null }
  // statuses: 逗号分隔的多值（如 "enrolling,active"）→ 用 $in
  if (statuses) {
    const arr = String(statuses).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 0) filter.status = { $in: arr }
  } else if (status) {
    filter.status = status
  }
  if (subject) filter.subject = subject
  if (teacher) filter.teacher = teacher
  if (room) filter.room = room
  let items = await CourseInstance.find(filter)
    .populate('courseProduct', 'name subjects totalLessons originalPrice discountPrice promotionPrice promotionActive validDays')
    .populate('subject', 'name')
    .populate('teacher', 'mobile realName')
    .populate('room', 'name location')
    .sort({ startDate: -1 })
    .lean()
  if (keyword) {
    const kw = String(keyword).toLowerCase()
    items = items.filter((i) => i.name && i.name.toLowerCase().includes(kw))
  }
  // 一次性带出每条的已报名人数（仅 status='enrolled'）、已排课节数、已归档排课节数、未绑课包报名数。
  // 走 aggregate 一次查完，避免在循环里 N 次 countDocuments。
  if (items.length > 0) {
    const ids = items.map((i) => i._id)
    const [countMap, scheduleMap, archivedMap, noSpMap, endedMap] = await Promise.all([
      courseEnrollmentService.countEnrolledByInstances(ids),
      countSchedulesByInstances(ids),
      countArchivedSchedulesByInstances(ids),
      countEnrollmentsWithoutStudentProduct(ids, orgId),
      countEndedSchedulesByInstances(ids)
    ])
    for (const it of items) {
      it.enrolledCount = countMap.get(String(it._id)) || 0
      it.scheduledCount = scheduleMap.get(String(it._id)) || 0
      it.archivedCount = archivedMap.get(String(it._id)) || 0
      it.endedCount = endedMap.get(String(it._id)) || 0
      it.enrollmentsWithoutSp = noSpMap.get(String(it._id)) || 0
    }
  }
  return items
}

/**
 * 批量按开班统计已排课节数（含全部状态）。
 * 返回 Map<courseInstanceId(string), count>。
 * 用于 courseInstance.list 一次性带出每条的"已排"节数。
 */
async function countSchedulesByInstances(courseInstanceIds) {
  if (!courseInstanceIds || courseInstanceIds.length === 0) return new Map()
  const ids = courseInstanceIds.map((id) => (typeof id === 'string' ? require('mongoose').Types.ObjectId.createFromHexString(id) : id))
  const rows = await LessonSchedule.aggregate([
    { $match: { courseInstance: { $in: ids } } },
    { $group: { _id: '$courseInstance', count: { $sum: 1 } } }
  ])
  return new Map(rows.map((r) => [String(r._id), r.count]))
}

// 批量按开班统计「已归档」排课节数（status = archived）。
// 用于 courseInstance.list 一次性带出每条的"已归档"节数，配合 scheduledCount 决定是否能结课。
async function countArchivedSchedulesByInstances(courseInstanceIds) {
  if (!courseInstanceIds || courseInstanceIds.length === 0) return new Map()
  const ids = courseInstanceIds.map((id) => (typeof id === 'string' ? require('mongoose').Types.ObjectId.createFromHexString(id) : id))
  const { LessonScheduleStatus } = require('@shared/enums')
  const rows = await LessonSchedule.aggregate([
    { $match: { courseInstance: { $in: ids }, status: LessonScheduleStatus.ARCHIVED } },
    { $group: { _id: '$courseInstance', count: { $sum: 1 } } }
  ])
  return new Map(rows.map((r) => [String(r._id), r.count]))
}

// 批量按开班统计「已结束」排课节数（status = completed；cancelled 不算"结束"——它没真正上过）。
// 用于 courseInstance.list 一次性带出每条的"已结束"节数，配合 archivedCount 展示上课进度。
async function countEndedSchedulesByInstances(courseInstanceIds) {
  if (!courseInstanceIds || courseInstanceIds.length === 0) return new Map()
  const ids = courseInstanceIds.map((id) => (typeof id === 'string' ? require('mongoose').Types.ObjectId.createFromHexString(id) : id))
  const { LessonScheduleStatus } = require('@shared/enums')
  const rows = await LessonSchedule.aggregate([
    { $match: { courseInstance: { $in: ids }, status: LessonScheduleStatus.COMPLETED } },
    { $group: { _id: '$courseInstance', count: { $sum: 1 } } }
  ])
  return new Map(rows.map((r) => [String(r._id), r.count]))
}

// 批量按开班统计「已报名但未绑定主用课包」的报名数（status=enrolled AND studentProduct=null）。
// 用于 courseInstance.list 一次性带出每条的"待补课包"数，配合 enrolledCount 决定是否能进入"进行中"。
async function countEnrollmentsWithoutStudentProduct(courseInstanceIds, orgId) {
  if (!courseInstanceIds || courseInstanceIds.length === 0) return new Map()
  const ids = courseInstanceIds.map((id) => (typeof id === 'string' ? require('mongoose').Types.ObjectId.createFromHexString(id) : id))
  const CourseEnrollment = require('@models/CourseEnrollment.model')
  const rows = await CourseEnrollment.aggregate([
    { $match: {
      org: orgId,
      courseInstance: { $in: ids },
      status: 'enrolled',
      $or: [{ studentProduct: null }, { studentProduct: { $exists: false } }]
    } },
    { $group: { _id: '$courseInstance', count: { $sum: 1 } } }
  ])
  return new Map(rows.map((r) => [String(r._id), r.count]))
}

async function detail(id, orgId) {
  const inst = await CourseInstance.findOne({ _id: id, org: orgId, deletedAt: null })
    .populate('courseProduct subject teacher room acceptedCourseProducts')
    .populate('statusLog.by', 'realName mobile')
    .lean()
  if (!inst) throw ApiError.notFound('开班不存在')
  // detail 也带上已报名人数、已排课节数、已归档节数、未绑课包报名数，前端编辑/详情弹窗能用到
  const { LessonScheduleStatus } = require('@shared/enums')
  const CourseEnrollment = require('@models/CourseEnrollment.model')
  inst.enrolledCount = await courseEnrollmentService.countEnrolled(inst._id)
  inst.scheduledCount = await LessonSchedule.countDocuments({ courseInstance: inst._id })
  inst.archivedCount = await LessonSchedule.countDocuments({
    courseInstance: inst._id,
    status: LessonScheduleStatus.ARCHIVED
  })
  inst.endedCount = await LessonSchedule.countDocuments({
    courseInstance: inst._id,
    status: LessonScheduleStatus.COMPLETED
  })
  inst.enrollmentsWithoutSp = await CourseEnrollment.countDocuments({
    org: orgId,
    courseInstance: inst._id,
    status: 'enrolled',
    $or: [{ studentProduct: null }, { studentProduct: { $exists: false } }]
  })
  return inst
}

/**
 * 创建开班：必填 schedulePlan（lessonsPerWeek / totalPlannedLessons 等）。
 * 若不传 acceptedCourseProducts，默认回落到 [courseProduct]。
 * 若传了 acceptedCourseProducts，校验所有 id 都属于本机构、且包含 courseProduct。
 * 自动计算 estimatedEndDate。
 */
async function create({
  orgId, courseProduct, subject, teacher, room, schedulePlan,
  acceptedCourseProducts, startDate, maxStudents, status,
  name, description, teacherIntro
}) {
  if (!await CourseProduct.exists({ _id: courseProduct, org: orgId })) {
    throw ApiError.badRequest('courseProduct 不属于本机构')
  }
  if (subject && !await Subject.exists({ _id: subject, org: orgId })) {
    throw ApiError.badRequest('subject 不属于本机构')
  }
  // org-scope 校验：User 不带 org 字段，组织归属在 UserOrgRel 上
  if (teacher && !await UserOrgRel.exists({ user: teacher, org: orgId })) {
    throw ApiError.badRequest('teacher 不属于本机构')
  }
  if (room && !await Room.exists({ _id: room, org: orgId })) {
    throw ApiError.badRequest('room 不属于本机构')
  }
  if (!schedulePlan || typeof schedulePlan !== 'object') {
    throw ApiError.badRequest('schedulePlan 必填')
  }
  assertSchedulePlanValid(schedulePlan)
  // acceptedCourseProducts 校验（可选；不传则回落到 [courseProduct]）
  let accepted = acceptedCourseProducts
  if (accepted === undefined) {
    accepted = [courseProduct]
  } else if (!Array.isArray(accepted) || accepted.length === 0) {
    throw ApiError.badRequest('acceptedCourseProducts 必须是非空数组')
  } else {
    const stringIds = accepted.map((id) => String(id))
    if (!stringIds.includes(String(courseProduct))) {
      throw ApiError.badRequest('acceptedCourseProducts 必须包含 courseProduct 自身')
    }
    const cnt = await CourseProduct.countDocuments({ _id: { $in: accepted }, org: orgId })
    if (cnt !== new Set(stringIds).size) {
      throw ApiError.badRequest('acceptedCourseProducts 含不属于本机构的产品 id')
    }
  }

  const estimatedEndDate = computeEstimatedEndDate(startDate, schedulePlan)

  const doc = await CourseInstance.create({
    org: orgId,
    courseProduct,
    subject: subject || undefined,
    teacher: teacher || undefined,
    room: room || undefined,
    schedulePlan,
    acceptedCourseProducts: accepted,
    startDate,
    estimatedEndDate,
    maxStudents,
    status: status || 'planning',
    name: name || '',
    description: description || '',
    teacherIntro: teacherIntro || '',
    statusLog: status && status !== 'planning' ? [{ to: status, at: new Date(), reason: '创建时指定' }] : []
  })
  return detail(doc._id, orgId)
}

/**
 * 更新开班。锁字段规则（非 planning 状态）：
 *   - subject / name / minutesPerLesson：完全锁死（payload 里有就拒绝）
 *   - totalPlannedLessons：可下调（不能上调），新值必须 >= 已创建的 LessonSchedule 数量
 *   - 其他字段（courseProduct / lessonsPerWeek / restDays / startDate / teacher / room /
 *     description / teacherIntro / maxStudents）：可改
 * 自动重算 estimatedEndDate（仅在 startDate 或 schedulePlan 真的变了时）。
 * 软删过的不能改。
 */
async function update(id, orgId, payload) {
  const cur = await CourseInstance.findOne({ _id: id, org: orgId, deletedAt: null }).lean()
  if (!cur) throw ApiError.notFound('开班不存在')

  if (cur.status !== 'planning') {
    // 锁字段：payload 里出现就拒绝
    for (const f of STRICT_LOCKED_FIELDS) {
      if (payload[f] !== undefined && String(payload[f] ?? '') !== String(cur[f] ?? '')) {
        throw ApiError.badRequest(`非筹备状态下不可修改 ${f}`)
      }
    }
    // schedulePlan.mode 锁死（改了会让已排 LessonSchedule 错位）
    if (payload.schedulePlan && payload.schedulePlan.mode !== undefined
        && payload.schedulePlan.mode !== (cur.schedulePlan?.mode || 'weekly')) {
      throw ApiError.badRequest('非筹备状态下不可修改 schedulePlan.mode')
    }
    // totalPlannedLessons：可下调，不能上调；新值必须 >= 已排课数
    if (payload.schedulePlan && payload.schedulePlan.totalPlannedLessons !== undefined) {
      const newTotal = Number(payload.schedulePlan.totalPlannedLessons)
      const oldTotal = Number(cur.schedulePlan.totalPlannedLessons)
      if (newTotal > oldTotal) {
        throw ApiError.badRequest('非筹备状态下 totalPlannedLessons 不可上调')
      }
      if (newTotal < oldTotal) {
        const existing = await LessonSchedule.countDocuments({ courseInstance: id, org: orgId })
        if (newTotal < existing) {
          throw ApiError.badRequest(`totalPlannedLessons (${newTotal}) 小于已排课数 (${existing})，请先删除多余排课`)
        }
      }
    }
  }

  if (payload.courseProduct && !await CourseProduct.exists({ _id: payload.courseProduct, org: orgId })) {
    throw ApiError.badRequest('courseProduct 不属于本机构')
  }
  if (payload.subject && !await Subject.exists({ _id: payload.subject, org: orgId })) {
    throw ApiError.badRequest('subject 不属于本机构')
  }
  if (payload.teacher && !await UserOrgRel.exists({ user: payload.teacher, org: orgId })) {
    throw ApiError.badRequest('teacher 不属于本机构')
  }
  if (payload.room && !await Room.exists({ _id: payload.room, org: orgId })) {
    throw ApiError.badRequest('room 不属于本机构')
  }
  if (payload.schedulePlan) {
    // 用新校验器跑一遍（合并已有 schedulePlan，避免单独传 cycleOnDays 时漏校验）
    const merged = { ...(cur.schedulePlan || {}), ...payload.schedulePlan }
    assertSchedulePlanValid(merged)
  }
  if (payload.acceptedCourseProducts !== undefined) {
    if (!Array.isArray(payload.acceptedCourseProducts) || payload.acceptedCourseProducts.length === 0) {
      throw ApiError.badRequest('acceptedCourseProducts 必须是非空数组')
    }
    const targetCourseProduct = payload.courseProduct
    const resolved = targetCourseProduct
      ? String(targetCourseProduct)
      : (await CourseInstance.findOne({ _id: id, org: orgId }).select('courseProduct').lean())?.courseProduct
    if (resolved && !payload.acceptedCourseProducts.map(String).includes(String(resolved))) {
      throw ApiError.badRequest('acceptedCourseProducts 必须包含 courseProduct 自身')
    }
    const cnt = await CourseProduct.countDocuments({ _id: { $in: payload.acceptedCourseProducts }, org: orgId })
    if (cnt !== new Set(payload.acceptedCourseProducts.map(String)).size) {
      throw ApiError.badRequest('acceptedCourseProducts 含不属于本机构的产品 id')
    }
  }

  // 自动重算 estimatedEndDate
  const newStartDate = payload.startDate !== undefined ? payload.startDate : cur.startDate
  const newSchedulePlan = payload.schedulePlan
    ? { ...cur.schedulePlan, ...payload.schedulePlan }
    : cur.schedulePlan
  const newEstimatedEndDate = computeEstimatedEndDate(newStartDate, newSchedulePlan)

  const doc = await CourseInstance.findOneAndUpdate(
    { _id: id, org: orgId, deletedAt: null },
    { ...payload, estimatedEndDate: newEstimatedEndDate },
    { new: true, runValidators: true }
  )
  if (!doc) throw ApiError.notFound('开班不存在')
  return detail(doc._id, orgId)
}

/**
 * 状态变更
 * 状态机：
 *   planning → enrolling → active → closed（正向；不可跳级但可连续推进）
 *   enrolling → planning     （可逆，需"无 CourseEnrollment 且无 LessonAttendance"）
 *   active    → enrolling    （可逆，同上）
 *   closed    → *            （不可逆）
 *   *         → cancelled    （死胡同，仅超管）
 * 权限：
 *   - cancelled：仅平台超管（req.user.isPlatformAdmin）
 *   - 其他：courseInstance.write
 * 入参：by = req.user.id（操作人），reason = 必填（写 statusLog）
 */
async function setStatus(id, orgId, toStatus, by, reason, isPlatformAdmin) {
  if (!reason || !String(reason).trim()) {
    throw ApiError.badRequest('reason 必填')
  }
  const cur = await CourseInstance.findOne({ _id: id, org: orgId, deletedAt: null })
  if (!cur) throw ApiError.notFound('开班不存在')

  const from = cur.status
  if (from === toStatus) {
    throw ApiError.badRequest('状态未变化')
  }

  // cancelled 死胡同：从任何状态都能切到 cancelled，但仅超管；cancelled 不能再切走
  if (toStatus === 'cancelled') {
    if (!isPlatformAdmin) {
      throw ApiError.forbidden('仅平台超管可取消开班')
    }
    // 落到具体写入
  } else if (from === 'cancelled') {
    throw ApiError.badRequest('已取消的开班不可变更状态（只能软删）')
  } else if (from === 'closed') {
    throw ApiError.badRequest('已结班的开班不可变更状态')
  } else {
    // 正向 / 可逆校验
    const allowedNext = {
      planning: ['enrolling'],
      enrolling: ['planning', 'active'],
      active: ['enrolling', 'closed']
    }
    if (!allowedNext[from] || !allowedNext[from].includes(toStatus)) {
      throw ApiError.badRequest(`状态 ${from} → ${toStatus} 不允许`)
    }
    // 硬规则：enrolling → active 必须已排满 + 至少 1 个有效报名
    // 业务语义："进行中" = 已经在上课
    //   1) 必须把 schedulePlan.totalPlannedLessons 全部排完；
    //   2) 必须至少有 1 个 status='enrolled' 的 CourseEnrollment（没学生报名的开班不能进"进行中"）。
    if (from === 'enrolling' && toStatus === 'active') {
      const totalPlanned = Number(cur.schedulePlan?.totalPlannedLessons || 0)
      const scheduledCount = await LessonSchedule.countDocuments({ courseInstance: id, org: orgId })
      if (totalPlanned <= 0) {
        throw ApiError.badRequest('排课计划未配置（totalPlannedLessons 缺失），无法进入"进行中"')
      }
      if (scheduledCount < totalPlanned) {
        throw ApiError.badRequest(
          `尚未排满：已排 ${scheduledCount} / ${totalPlanned} 节，无法进入"进行中"。请先排满所有排课。`
        )
      }
      const enrolledCount = await CourseEnrollment.countDocuments({
        courseInstance: id,
        org: orgId,
        status: CourseEnrollmentStatus.ENROLLED
      })
      if (enrolledCount === 0) {
        throw ApiError.badRequest('该开班暂无学生报名，无法进入"进行中"。请先在报名管理中添加学生。')
      }
      // ★每个报名的学生都必须有主用课包（enrollment.studentProduct 非空）
      //   业务语义：进入"进行中"意味着这学期正式开始上课，
      //   没有课包的学生既无法生成考勤也无法消课，应当先补购课或调整课包绑定。
      const withoutSp = await CourseEnrollment.countDocuments({
        courseInstance: id,
        org: orgId,
        status: CourseEnrollmentStatus.ENROLLED,
        $or: [{ studentProduct: null }, { studentProduct: { $exists: false } }]
      })
      if (withoutSp > 0) {
        throw ApiError.badRequest(
          `有 ${withoutSp} 名学生尚未绑定主用课包，无法进入"进行中"。请到「报名管理」中为这些学生补绑课包。`
        )
      }
    }
    // 可逆：enrolling→planning、active→enrolling，要求无 CourseEnrollment 且无 LessonAttendance
    const isReversal = (from === 'enrolling' && toStatus === 'planning') ||
                       (from === 'active' && toStatus === 'enrolling')
    if (isReversal) {
      const [enrollCount, lessonCount] = await Promise.all([
        CourseEnrollment.countDocuments({
          courseInstance: id,
          status: { $in: [CourseEnrollmentStatus.ENROLLED] }
        }),
        LessonSchedule.countDocuments({ courseInstance: id, org: orgId })
      ])
      if (enrollCount > 0 || lessonCount > 0) {
        throw ApiError.badRequest(
          `存在 ${enrollCount} 条有效报名 / ${lessonCount} 节排课，无法回退状态`
        )
      }
    }
    // 硬规则：active → closed 必须该开班下所有 LessonSchedule 都已归档
    // 业务语义："结课"意味着这学期所有课都上完了 + 课评写完 + 老师/教务归档完，
    //          任何一节还停留在 scheduled / preparing / in_progress / completed / cancelled 的排课都不可结课。
    if (from === 'active' && toStatus === 'closed') {
      const { LessonScheduleStatus } = require('@shared/enums')
      const notArchived = await LessonSchedule.countDocuments({
        courseInstance: id,
        org: orgId,
        status: { $ne: LessonScheduleStatus.ARCHIVED }
      })
      if (notArchived > 0) {
        throw ApiError.badRequest(
          `开班下仍有 ${notArchived} 节排课未归档，无法结课。请先在「上课表」里把所有排课归档。`
        )
      }
    }
  }

  cur.status = toStatus
  cur.statusLog.push({ from, to: toStatus, by, at: new Date(), reason: String(reason).trim() })
  await cur.save()

  // ★开班关闭(active→closed)后,级联把该开班下所有 enrolled 报名自动归档(archived)。
  //  - best-effort:cur.save() 是业务事件的源事实,必须落库;enrollments 级联失败时只 warn,不抛错
  //  - 与 lessonSchedule.service.finish() 的"业务实体先持久化 + 副作用后续"模式一致
  //  - 全仓不使用 Mongoose session(grep withTransaction 无结果),故不加事务
  if (from === CourseInstanceStatus.ACTIVE && toStatus === CourseInstanceStatus.CLOSED) {
    try {
      const r = await CourseEnrollment.updateMany(
        { courseInstance: id, status: CourseEnrollmentStatus.ENROLLED },
        { $set: { status: 'archived', archivedAt: new Date() } }
      )
      if (r.modifiedCount === 0) {
        // eslint-disable-next-line no-console
        console.warn('[cascade-archive] 0 docs updated for courseInstance', id)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[cascade-archive] failed for courseInstance', id, e && e.message)
    }
  }

  return detail(id, orgId)
}

/**
 * 软删：仅在 planning / cancelled 状态可删；仅超管可执行。
 * 理由：active / enrolling / closed 状态的开班已有业务痕迹（报名 / 排课 / 考勤），
 * 不能硬抹掉。cancelled 是死胡同，删了不会影响现有数据。
 */
async function softDelete(id, orgId, by, isPlatformAdmin) {
  if (!isPlatformAdmin) {
    throw ApiError.forbidden('仅平台超管可删除开班')
  }
  const cur = await CourseInstance.findOne({ _id: id, org: orgId, deletedAt: null })
  if (!cur) throw ApiError.notFound('开班不存在')
  if (!['planning', 'cancelled'].includes(cur.status)) {
    throw ApiError.badRequest(`状态为 ${cur.status} 的开班不可删除（仅筹备/取消状态可删）`)
  }
  cur.deletedAt = new Date()
  cur.statusLog.push({ from: cur.status, to: cur.status, by, at: new Date(), reason: '软删' })
  await cur.save()
  return { success: true, id, deletedAt: cur.deletedAt }
}

module.exports = {
  list, detail, create, update,
  setStatus, softDelete,
  computeEstimatedEndDate,
  assertSchedulePlanValid
}
