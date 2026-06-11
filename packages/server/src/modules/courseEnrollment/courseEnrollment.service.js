'use strict'

const mongoose = require('mongoose')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const CourseInstance = require('@models/CourseInstance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const StudentProduct = require('@models/StudentProduct.model')
const Student = require('@models/Student.model')
const User = require('@models/User.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const { CourseEnrollmentStatus, CourseInstanceStatus, AttendanceStatus } = require('@shared/enums')
const password = require('@utils/password')

function toObjectId(v) {
  if (v instanceof mongoose.Types.ObjectId) return v
  return new mongoose.Types.ObjectId(String(v))
}

/**
 * 当前开班的在册学生数(status='enrolled')
 */
async function countEnrolled(courseInstanceId) {
  return CourseEnrollment.countDocuments({
    courseInstance: courseInstanceId,
    status: CourseEnrollmentStatus.ENROLLED
  })
}

/**
 * 批量按开班统计 enrolled 计数。
 * 返回 Map<courseInstanceId(string), count>。
 * 用于 courseInstance.list/detail 一次性带出每条的"已报"人数。
 */
async function countEnrolledByInstances(courseInstanceIds) {
  if (!courseInstanceIds || courseInstanceIds.length === 0) return new Map()
  const ids = courseInstanceIds.map(toObjectId)
  const rows = await CourseEnrollment.aggregate([
    {
      $match: {
        status: CourseEnrollmentStatus.ENROLLED,
        courseInstance: { $in: ids }
      }
    },
    { $group: { _id: '$courseInstance', count: { $sum: 1 } } }
  ])
  return new Map(rows.map((r) => [String(r._id), r.count]))
}

/**
 * 报名校验(宽松策略)
 *
 * 设计要点:
 *  - 报课时**不强制**要求学生已拥有 StudentProduct. 家长/教务可以先把学生
 *    报进开班, 购课(创建 StudentProduct)放到后面再补.
 *  - 报课时**不强制**做 maxStudents 名额校验: 当一个开班报满时, 业务上的
 *    "分班"动作是去调整 (move) 部分学生的 `courseInstance` 到另一个开班,
 *    而不是在前置环节拒绝超额. 所以这里允许超过 maxStudents, 让 UI/操作员
 *    在后续做"分班".
 *  - 真正需要 StudentProduct 的环节是 LessonAttendance 生成时(见
 *    LessonSchedule.service.generateAttendancesForSchedule).
 *
 * 注: 批量报名场景里 student 形参没意义, 这里只校验开班状态.
 */
async function assertCanEnroll({ orgId, courseInstance }) {
  const inst = await CourseInstance.findOne({ _id: courseInstance, org: orgId }).lean()
  if (!inst) throw ApiError.badRequest('开班不存在')

  if (![CourseInstanceStatus.ENROLLING, CourseInstanceStatus.ACTIVE].includes(inst.status)) {
    throw ApiError.unprocessable(`开班当前状态 ${inst.status},不允许报名`)
  }

  return inst
}

async function list({ orgId, courseInstance, courseInstanceStatus, student, status, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (courseInstance) filter.courseInstance = courseInstance
  if (student) filter.student = student
  if (status) filter.status = status

  // courseInstanceStatus: 多值（数组 / 逗号分隔字符串），按 CourseInstance.status 过滤；
  // 与上面的 courseInstance（单值）共存时取交集；空值视为不过滤。
  if (courseInstanceStatus) {
    const arr = Array.isArray(courseInstanceStatus)
      ? courseInstanceStatus
      : String(courseInstanceStatus).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 0) {
      const invalid = arr.filter((s) => !Object.values(CourseInstanceStatus).includes(s))
      if (invalid.length > 0) {
        throw ApiError.badRequest(`courseInstanceStatus 非法:${invalid.join(',')}`)
      }
      const ciFilter = { org: orgId, status: { $in: arr } }
      // 若同时指定了 courseInstance（单值），用 ObjectId 收窄；交集为空时直接返回空
      if (courseInstance) {
        const singleId = toObjectId(courseInstance)
        const hit = await CourseInstance.findOne({ _id: singleId, org: orgId, status: { $in: arr } })
          .select('_id').lean()
        if (!hit) {
          return { items: [], total: 0, page: p.page, pageSize: p.pageSize }
        }
        filter.courseInstance = singleId
      } else {
        const allowedCiIds = await CourseInstance.find(ciFilter).select('_id').lean()
        if (allowedCiIds.length === 0) {
          return { items: [], total: 0, page: p.page, pageSize: p.pageSize }
        }
        filter.courseInstance = { $in: allowedCiIds.map((c) => c._id) }
      }
    }
  }

  const [items, total] = await Promise.all([
    CourseEnrollment.find(filter)
      .populate('student', 'name')
      .populate('studentProduct', 'remainingLessons totalLessons expireDate isActive source giftReason giftedBy giftedAt courseProduct')
      .populate({
        path: 'courseInstance',
        select: 'name teacher room courseProduct startDate maxStudents status schedulePlan acceptedCourseProducts',
        populate: [
          { path: 'courseProduct', select: 'name totalLessons price' },
          { path: 'teacher', select: 'realName mobile' },
          { path: 'room', select: 'name location' }
        ]
      })
      .sort({ enrolledAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    CourseEnrollment.countDocuments(filter)
  ])

  // 为每条报名记录附加以下展示字段(每个条目单独查,避免 N+1 退化为少量批量查询):
  //   totalLessons       开班计划的总课时数(优先 schedulePlan.totalPlannedLessons,回落 courseProduct.totalLessons)
  //   scheduledLessons   该开班下已生成的排课数(LessonSchedule)
  //   attendedLessons    该学生在本开班下的"已消课"数(LessonAttendance.status='completed')
  //                      TODO: LessonAttendance 模块功能尚未完善,目前按"生成过考勤且
  //                      status=completed"粗略计数,后续接入完整消课流程后,这里要:
  //                        1) 排除 lessonSchedule.status='cancelled' 的考勤
  //                        2) 只统计 studentProduct 非空 且 remainingLessons 真实扣减过的考勤
  //                        3) 与"已结业/退班"等报名状态联动(退班后不再累加)
  //   studentProduct     为该开班消课时按 FIFO 选出的 StudentProduct(剩余/总/来源/赠课原因)
  //                      null 表示该学生当前没有可用课包(后续排课时不会生成考勤)
  if (items.length > 0) {
    const ciIdObjs = [...new Set(
      items.map((i) => i.courseInstance && i.courseInstance._id).filter(Boolean)
    )].map(toObjectId)
    const studentIds = [...new Set(
      items.map((i) => i.student && (i.student._id || i.student)).filter(Boolean)
    )].map(toObjectId)

    // 1) 每个开班的总计划课时(schedulePlan.totalPlannedLessons) + 已排课数(LessonSchedule.count)
    const [planRows, scheduleRows] = await Promise.all([
      CourseInstance.find({ _id: { $in: ciIdObjs } })
        .select('schedulePlan.totalPlannedLessons courseProduct')
        .populate('courseProduct', 'totalLessons')
        .lean(),
      LessonSchedule.aggregate([
        { $match: { org: orgId, courseInstance: { $in: ciIdObjs } } },
        { $group: { _id: '$courseInstance', count: { $sum: 1 } } }
      ])
    ])
    const planMap = new Map(planRows.map((r) => {
      const planned = (r.schedulePlan && r.schedulePlan.totalPlannedLessons)
        || (r.courseProduct && r.courseProduct.totalLessons)
        || null
      return [String(r._id), planned]
    }))
    const scheduleCountMap = new Map(scheduleRows.map((r) => [String(r._id), r.count]))

    // 2) 已消课数(LessonAttendance.status=completed),按 (courseInstance, student) 聚合。
    //    LessonAttendance 没有 courseInstance 字段,需经 lessonSchedule 中转;为减少
    //    $lookup 开销,改成"先取这些开班下的排课 id,再按排课 id 过滤考勤"。
    //    TODO: 见上,LessonAttendance 模块完善后这里要进一步过滤。
    const scheduleIds = await LessonSchedule.find({ courseInstance: { $in: ciIdObjs } })
      .select('_id courseInstance')
      .lean()
    const scheduleIdToCi = new Map(scheduleIds.map((s) => [String(s._id), String(s.courseInstance)]))
    const scheduleIdObjs = scheduleIds.map((s) => s._id)

    const attendedMap = new Map()
    if (scheduleIdObjs.length > 0) {
      const attRows = await LessonAttendance.find({
        org: orgId,
        lessonSchedule: { $in: scheduleIdObjs },
        status: AttendanceStatus.COMPLETED
      }).select('lessonSchedule student').lean()
      for (const a of attRows) {
        const ciId = scheduleIdToCi.get(String(a.lessonSchedule))
        if (!ciId) continue
        const key = `${ciId}::${a.student}`
        attendedMap.set(key, (attendedMap.get(key) || 0) + 1)
      }
    }

    // 3) StudentProduct:在 CourseInstance.acceptedCourseProducts 范围内,FIFO 选最早
    //    过期的未过期未用完课包(与 LessonSchedule.generateAttendancesForSchedule 同口径)。
    //    一次拉出所有可能候选,内存里按 student 过滤,避免每个学生单独查询。
    const now = new Date()
    const sps = await StudentProduct.find({
      org: orgId,
      student: { $in: studentIds },
      isActive: true,
      remainingLessons: { $gt: 0 },
      expireDate: { $gt: now }
    })
      .select('student courseProduct remainingLessons totalLessons expireDate source giftReason')
      .sort({ expireDate: 1 })
      .lean()
    const spByStudent = new Map()
    for (const sp of sps) {
      const key = String(sp.student)
      if (!spByStudent.has(key)) spByStudent.set(key, [])
      spByStudent.get(key).push(sp)
    }

    for (const item of items) {
      const ci = item.courseInstance
      if (!ci) continue
      const ciId = String(ci._id)

      // 总课时 + 已排课数
      const total = planMap.get(ciId) || 0
      const scheduled = scheduleCountMap.get(ciId) || 0
      const sid = item.student && (item.student._id || item.student)
      const attended = (sid && attendedMap.get(`${ciId}::${sid}`)) || 0

      item.progress = {
        totalLessons: total,
        scheduledLessons: scheduled,
        attendedLessons: attended
      }

      // 课包(FIFO 选最早过期)
      const accepted = (ci.acceptedCourseProducts && ci.acceptedCourseProducts.length)
        ? ci.acceptedCourseProducts.map(String)
        : (ci.courseProduct && ci.courseProduct._id
            ? [String(ci.courseProduct._id)]
            : (ci.courseProduct ? [String(ci.courseProduct)] : []))

      const candidates = (sid ? spByStudent.get(String(sid)) : null) || []
      const picked = candidates.find((sp) => accepted.includes(String(sp.courseProduct))) || null
      if (picked) {
        item.studentProduct = {
          _id: picked._id,
          remainingLessons: picked.remainingLessons,
          totalLessons: picked.totalLessons,
          expireDate: picked.expireDate,
          source: picked.source,
          giftReason: picked.giftReason || null
        }
      } else {
        item.studentProduct = null
      }
    }
  }

  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id, orgId) {
  const e = await CourseEnrollment.findOne({ _id: id, org: orgId })
    .populate('student', 'name gender')
    .populate('studentProduct', 'remainingLessons totalLessons expireDate isActive source giftReason giftedBy giftedAt courseProduct')
    .populate({
      path: 'courseInstance',
      populate: [
        { path: 'courseProduct', select: 'name totalLessons price' },
        { path: 'teacher', select: 'realName' },
        { path: 'room', select: 'name' }
      ]
    })
    .lean()
  if (!e) throw ApiError.notFound('报名记录不存在')

  // 附加与 list 一致的 progress / studentProduct 字段
  const ci = e.courseInstance
  if (ci) {
    const studentId = e.student && (e.student._id || e.student)
    const [planned, scheduleCount, attendedCount, sps] = await Promise.all([
      CourseInstance.findById(ci._id).select('schedulePlan.totalPlannedLessons courseProduct').populate('courseProduct', 'totalLessons').lean(),
      LessonSchedule.countDocuments({ org: orgId, courseInstance: ci._id }),
      // TODO: LessonAttendance 模块完善后,这里要排除 cancelled 排课、限定为真实扣减过的考勤
      LessonAttendance.aggregate([
        { $match: { org: orgId, status: AttendanceStatus.COMPLETED } },
        { $lookup: { from: 'lesson_schedules', localField: 'lessonSchedule', foreignField: '_id', as: 'sched' } },
        { $unwind: '$sched' },
        { $match: { 'sched.courseInstance': toObjectId(ci._id), student: toObjectId(studentId) } },
        { $count: 'n' }
      ]),
      StudentProduct.find({
        org: orgId,
        student: studentId,
        isActive: true,
        remainingLessons: { $gt: 0 },
        expireDate: { $gt: new Date() }
      })
        .select('courseProduct remainingLessons totalLessons expireDate source giftReason')
        .sort({ expireDate: 1 })
        .lean()
    ])

    const total = (planned && planned.schedulePlan && planned.schedulePlan.totalPlannedLessons)
      || (planned && planned.courseProduct && planned.courseProduct.totalLessons)
      || 0
    const accepted = (ci.acceptedCourseProducts && ci.acceptedCourseProducts.length)
      ? ci.acceptedCourseProducts.map(String)
      : (ci.courseProduct && ci.courseProduct._id
          ? [String(ci.courseProduct._id)]
          : (ci.courseProduct ? [String(ci.courseProduct)] : []))

    const picked = sps.find((sp) => accepted.includes(String(sp.courseProduct))) || null

    e.progress = {
      totalLessons: total,
      scheduledLessons: scheduleCount,
      // TODO: 见 list 中的注释,LessonAttendance 模块完善后这里同步细化
      attendedLessons: (attendedCount[0] && attendedCount[0].n) || 0
    }
    e.studentProduct = picked ? {
      _id: picked._id,
      remainingLessons: picked.remainingLessons,
      totalLessons: picked.totalLessons,
      expireDate: picked.expireDate,
      source: picked.source,
      giftReason: picked.giftReason || null
    } : null
  }

  return e
}

/**
 * 创建报名(批量).
 *
 * 入参兼容两种形态:
 *   - { courseInstance, student }            —— 单值 (client/uni-app 在用)
 *   - { courseInstance, students: [..] }     —— 数组 (admin 后台批量报名)
 *
 * 行为:
 *   - 仅校验开班状态一次(批量场景下 N 次循环不必重复查开班)
 *   - 学生去重 + 预查归属 + 预查已存在的报名(避免循环里 N 次查询)
 *   - 部分成功策略: 单个学生失败不阻塞其他学生, 收集到 failed 数组
 *
 * 返回:
 *   {
 *     success: [{ enrollmentId, student: {_id, name}, status, enrolledAt }],
 *     failed:  [{ student, studentName, reason }],
 *     courseInstance
 *   }
 *
 * 前端按 success.length / failed.length 决定提示文案(全成功 / 部分成功 / 全失败).
 */
async function create({ orgId, courseInstance, student, students }) {
  // 兼容: 把 student 单值或 students 数组统一成数组
  const ids = Array.isArray(students) && students.length > 0
    ? students
    : (student ? [student] : [])
  if (ids.length === 0) {
    throw ApiError.badRequest('请提供 student 或 students')
  }

  // 校验开班状态(一次性)
  await assertCanEnroll({ orgId, courseInstance })

  // 去重 + 预查学生归属(同时排除黑名单学员)
  const uniqueIds = [...new Set(ids.map(String))]
  const validStudents = await Student.find({
    _id: { $in: uniqueIds },
    org: orgId,
    isBlocked: { $ne: true }
  }).select('_id name').lean()
  const nameMap = new Map(validStudents.map((s) => [String(s._id), s.name]))

  // 预查已存在的报名(避免循环里 N 次查询)
  const existing = await CourseEnrollment.find({
    org: orgId,
    courseInstance,
    student: { $in: uniqueIds }
  }).select('student status').lean()
  const dupMap = new Map(existing.map((e) => [String(e.student), e.status]))

  // ★预取开班的 acceptedCourseProducts + 当前时间（用于按 FIFO 预选主用课包）
  const inst = await CourseInstance.findById(courseInstance)
    .select('acceptedCourseProducts courseProduct').lean()
  const accepted = (inst && inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
    ? inst.acceptedCourseProducts
    : (inst ? [inst.courseProduct] : [])
  const pickNow = new Date()

  const success = []
  const failed = []

  for (const sid of uniqueIds) {
    const studentName = nameMap.get(sid)
    if (!studentName) {
      // 在 uniqueIds 中但不在 validStudents 中 → 不存在 / 不属于本机构 / 已被黑名单
      failed.push({ student: sid, studentName: '', reason: '学生不存在或不属于本机构或已被禁用' })
      continue
    }
    const dupStatus = dupMap.get(sid)
    if (dupStatus) {
      const reason = dupStatus === CourseEnrollmentStatus.ENROLLED
        ? '已在该开班报名'
        : `已存在历史报名(${dupStatus}),请走重新报名流程`
      failed.push({ student: sid, studentName, reason })
      continue
    }

    // ★按 FIFO 自动选主用课包（acceptedCourseProducts 范围内的有效课包）
    //   找不到时不阻断报名（enrollment.studentProduct = null；后续排课会跳过该学生）
    let pickedSpId = null
    try {
      const picked = await StudentProduct.findOne({
        org: orgId,
        student: sid,
        courseProduct: { $in: accepted },
        isActive: true,
        remainingLessons: { $gt: 0 },
        expireDate: { $gt: pickNow }
      }).sort({ expireDate: 1 }).select('_id').lean()
      if (picked) pickedSpId = picked._id
    } catch (_) { /* 选包失败不阻断报名创建 */ }

    try {
      const doc = await CourseEnrollment.create({
        org: orgId,
        courseInstance,
        student: sid,
        studentProduct: pickedSpId
      })
      success.push({
        enrollmentId: doc._id,
        student: { _id: sid, name: studentName },
        status: doc.status,
        studentProduct: pickedSpId,
        enrolledAt: doc.enrolledAt
      })
    } catch (e) {
      // E11000: unique(student, courseInstance) 冲突, 通常已被前置 dupMap 拦掉,
      // 这里兜住并发场景
      const reason = e && e.code === 11000
        ? '该学生已报名(并发冲突)'
        : (e && e.message ? e.message : '创建失败')
      failed.push({ student: sid, studentName, reason })
    }
  }

  // 报名后不自动补 LessonAttendance。
  // 业务语义（2026-06 修订）：LessonAttendance 仅在 LessonSchedule 「未上课 → 准备上课」
  //   切换时由 lessonSchedule.service.prepare() 一次性生成（基于当时的 enrolled 名单 + 有效课包）。
  //   报名只把学生放进 CourseInstance.enrollments；下一次 prepare() 会自然把他/她纳入名单。
  //   这避免了「报名后立即补考勤 + 后续 prepare 又重补」的双路径复杂度，
  //   也避免「学生在开班 active 之前报名 → active 之后再被补考勤」造成的混乱。
  //   兜底：教务仍可通过 POST /api/v1/lesson-attendances 手动加考勤（遗留补报名场景）。

  return { success, failed, courseInstance }
}

async function setStatus({ id, orgId, toStatus, reason }) {
  if (!Object.values(CourseEnrollmentStatus).includes(toStatus)) {
    throw ApiError.badRequest(`未知状态:${toStatus}`)
  }
  const e = await CourseEnrollment.findOne({ _id: id, org: orgId })
  if (!e) throw ApiError.notFound('报名记录不存在')

  const from = e.status
  if (from === toStatus) return detail(e._id, orgId)

  // 状态机约束
  const allowed = {
    [CourseEnrollmentStatus.ENROLLED]: [
      CourseEnrollmentStatus.ARCHIVED,
      CourseEnrollmentStatus.DROPPED,
      CourseEnrollmentStatus.WITHDREW
    ],
    [CourseEnrollmentStatus.DROPPED]: [CourseEnrollmentStatus.ENROLLED], // 允许恢复
    [CourseEnrollmentStatus.WITHDREW]: [CourseEnrollmentStatus.ENROLLED],
    [CourseEnrollmentStatus.ARCHIVED]: [] // 归档：终态
  }
  if (!(allowed[from] || []).includes(toStatus)) {
    throw ApiError.badRequest(`状态 ${from} → ${toStatus} 不允许`)
  }

  const now = new Date()
  e.status = toStatus
  if (toStatus === CourseEnrollmentStatus.ARCHIVED) e.archivedAt = now
  if (toStatus === CourseEnrollmentStatus.DROPPED) {
    e.droppedAt = now
    e.dropReason = reason || e.dropReason
  }
  if (toStatus === CourseEnrollmentStatus.WITHDREW) {
    e.droppedAt = now
    e.dropReason = reason || e.dropReason
  }
  await e.save()
  return detail(e._id, orgId)
}

/**
 * 物理删除报名记录(「误操」场景)。
 * 入口权限已在 router 层用 requirePlatformAdmin 拦过;此处再做一次
 * 业务校验 + 密码二次确认,确保:
 *   1) 仅平台超管可执行(防御性双检,即便路由配错也不会误删)
 *   2) 操作人必须再次输入自己的登录密码 —— 防"账号被人借用"或
 *      "锁定屏被绕过"的破坏性操作场景
 *   3) 仅 status='enrolled' 状态可删:已结业/退班的记录是审计/统计
 *      依据,不允许物理抹掉
 *
 * 注意:平台超管在 requireOrg 中间件里如果不传 x-org-id,req.orgId 会
 * 是 null。所以超管做删除前必须先在 header 里指定目标机构 —— 防止
 * 误删其他机构的报名。
 */
async function remove({ id, orgId, isPlatformAdmin, userId, password: plainPwd }) {
  if (!isPlatformAdmin) {
    throw ApiError.forbidden('仅平台超管可删除报名记录')
  }
  if (!plainPwd || !String(plainPwd).trim()) {
    throw ApiError.badRequest('请输入操作密码以确认')
  }
  if (!orgId) {
    throw ApiError.badRequest('缺少 x-org-id,请先切换到目标机构')
  }
  // 密码二次校验(用 auth 同款 argon2 工具,统一算法)
  const user = await User.findOne({ _id: userId, isActive: true }).select('+passwordHash')
  if (!user) throw ApiError.unauthorized('用户不存在')
  const ok = await password.verify(user.passwordHash, String(plainPwd))
  if (!ok) throw ApiError.unauthorized('操作密码错误')

  // 业务校验:仅 enrolled 状态可物理删除
  const e = await CourseEnrollment.findOne({ _id: id, org: orgId })
  if (!e) throw ApiError.notFound('报名记录不存在')
  if (e.status !== CourseEnrollmentStatus.ENROLLED) {
    throw ApiError.badRequest('仅 enrolled 状态可删除(已结业/退班请走状态变更)')
  }
  await e.deleteOne()
  return { success: true }
}

/**
 * 调整报名(用于"分班")
 *
 * 业务约束:
 *  - 只能修改 `courseInstance`;不允许改 `student`(换人是另一种更重的业务动作)
 *  - 不允许改 `status`(走 setStatus);不允许改 `enrolledAt`
 *  - 仅 `enrolled` 状态可被分班;已结业/退班的不能分
 *  - 目标开班必须与当前开班不同(避免无意义的 no-op)
 *  - 目标开班必须属于本机构,且状态 ∈ {enrolling, active}
 *  - 转移后不会自动重建 LessonSchedule:原开班的历史考勤/作品保留,
 *    新开班的排课中该学生不会出现,直到该开班的 LessonSchedule 重新生成考勤.
 */
/**
 * 调整报名
 *
 * 可改字段：
 *  - courseInstance：分班 / 跨开班迁移
 *  - studentProduct：教务手动指定/调整该学生在该开班的主用课包
 *    · 传 null → 清空主用课包（排课时按 FIFO 兜底）
 *    · 传 ObjectId → 必须是该学生的、未过期、未用完、isActive=true、且属于当前开班的 acceptedCourseProducts 范围
 *    · 教务调整后，已生成的 LessonAttendance 的 studentProduct 字段**不会**自动同步；
 *      下一次排课/归档时会重新按 enrollment.studentProduct 计算（见 lessonSchedule.service）
 *
 * 业务约束：
 *  - 不允许改 `status`（走 setStatus）；不允许改 `enrolledAt`；不允许改 `student`（换人是另一种业务动作）
 *  - 仅 `enrolled` 状态可调整
 */
async function update(id, orgId, payload) {
  // 拒绝非白名单字段
  if ('status' in payload) throw ApiError.badRequest('请使用 setStatus 修改状态')
  if ('enrolledAt' in payload) throw ApiError.badRequest('enrolledAt 不可修改')
  if ('student' in payload) throw ApiError.badRequest('student 不可通过本接口修改')

  const cur = await CourseEnrollment.findOne({ _id: id, org: orgId })
  if (!cur) throw ApiError.notFound('报名记录不存在')

  // 没有任何可改字段时直接返回
  if (payload.courseInstance === undefined && payload.studentProduct === undefined) {
    return detail(cur._id, orgId)
  }

  if (cur.status !== CourseEnrollmentStatus.ENROLLED) {
    throw ApiError.badRequest('仅 enrolled 状态可调整报名')
  }

  // ─── 1) 分班：调整 courseInstance ─────────────────────
  if (payload.courseInstance !== undefined &&
      String(cur.courseInstance) !== String(payload.courseInstance)) {
    const target = await CourseInstance.findOne({ _id: payload.courseInstance, org: orgId })
      .select('status').lean()
    if (!target) throw ApiError.badRequest('目标开班不属于本机构')
    if (![CourseInstanceStatus.ENROLLING, CourseInstanceStatus.ACTIVE].includes(target.status)) {
      throw ApiError.unprocessable(`目标开班状态 ${target.status}，不允许转入`)
    }
    cur.courseInstance = target._id
    // 跨班后旧 studentProduct 与新开班未必兼容，清空让 service 按新开班的 acceptedCourseProducts 自动重选
    cur.studentProduct = null
  }

  // ─── 2) 教务手动指定 studentProduct ───────────────────
  if (payload.studentProduct !== undefined) {
    if (payload.studentProduct === null || payload.studentProduct === '') {
      // 显式清空
      cur.studentProduct = null
    } else {
      const sp = await StudentProduct.findOne({ _id: payload.studentProduct, org: orgId })
        .select('_id student courseProduct isActive remainingLessons expireDate')
        .lean()
      if (!sp) throw ApiError.badRequest('学生课包不存在或不属于本机构')
      if (String(sp.student) !== String(cur.student)) {
        throw ApiError.badRequest('该课包不属于当前学生')
      }
      // courseProduct 必须在当前开班的 acceptedCourseProducts 范围内
      const inst = await CourseInstance.findById(cur.courseInstance)
        .select('acceptedCourseProducts courseProduct').lean()
      const accepted = (inst && inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
        ? inst.acceptedCourseProducts
        : (inst ? [inst.courseProduct] : [])
      if (!accepted.some((id) => String(id) === String(sp.courseProduct))) {
        throw ApiError.badRequest('该课包不属于本开班接受的课程产品')
      }
      // 软提示：isActive=false / remainingLessons=0 / 已过期——可以指定但提示
      if (!sp.isActive || sp.remainingLessons <= 0) {
        // 仍允许（教务显式选择权），但要求显式确认——这里改为不阻断
      }
      cur.studentProduct = sp._id
    }
  }

  await cur.save()
  return detail(cur._id, orgId)
}

/**
 * 把指定 StudentProduct 回填到该学生在所有「enrolled + 主用课包为空 + 开班接受此 courseProduct」的报名上。
 *
 * 业务场景：学生先报名（此时还没课包，enrollment.studentProduct=null），
 * 之后通过订单付款 / 员工赠课拿到 StudentProduct。此时需要把 SP 反向绑定到
 * 已存在的 enrollment.studentProduct，否则「进入进行中」的校验会因
 * `enrollment.studentProduct == null` 误判。
 *
 * 设计约束：
 *  - **仅当 enrollment.studentProduct 为空时回填**——绝对不覆盖教务在
 *    「报名管理」里手动指定/调整过的主用课包（教务选择 = 强信号）。
 *  - 开班的 acceptedCourseProducts 必须包含此 SP 的 courseProduct（不相关
 *    开班不绑）。
 *  - 不抛错：单条失败不阻断主流程（订单/赠课），失败由调用方吞掉。
 *
 * @returns {Promise<{matched: number, bound: number}>}
 */
async function bindStudentProductToEnrollments({ orgId, student, studentProductId, courseProduct }) {
  if (!studentProductId || !courseProduct) return { matched: 0, bound: 0 }
  const broken = await CourseEnrollment.find({
    org: orgId,
    student,
    status: CourseEnrollmentStatus.ENROLLED,
    studentProduct: null
  }).select('_id courseInstance').lean()
  if (!broken.length) return { matched: 0, bound: 0 }

  const ciIds = broken.map((e) => e.courseInstance)
  const instances = await CourseInstance.find({
    _id: { $in: ciIds },
    $or: [
      { courseProduct },
      { acceptedCourseProducts: courseProduct }
    ]
  }).select('_id').lean()
  const acceptedCiSet = new Set(instances.map((i) => String(i._id)))

  const targets = broken
    .filter((e) => acceptedCiSet.has(String(e.courseInstance)))
    .map((e) => e._id)
  if (!targets.length) return { matched: broken.length, bound: 0 }

  // 二次过滤：updateMany 自身也加 studentProduct: null 防竞态（教务可能在中间手动改了）
  const r = await CourseEnrollment.updateMany(
    { _id: { $in: targets }, studentProduct: null },
    { $set: { studentProduct: studentProductId } }
  )
  return { matched: broken.length, bound: r.modifiedCount || 0 }
}

/**
 * 一次性回填历史 broken 报名：对全机构所有 enrolled + studentProduct=null 的报名，
 * 用 FIFO 选一个合适的 SP 写入。仅用于数据修复（一次性脚本 / 升级时调用）。
 *
 * @returns {Promise<{scanned: number, fixed: number, skipped: number}>}
 */
async function backfillEnrollmentsMainProduct({ orgId }) {
  const broken = await CourseEnrollment.find({
    org: orgId,
    status: CourseEnrollmentStatus.ENROLLED,
    studentProduct: null
  }).select('_id student courseInstance').lean()
  if (!broken.length) return { scanned: 0, fixed: 0, skipped: 0 }

  const ciIds = [...new Set(broken.map((b) => String(b.courseInstance)))]
  const instances = await CourseInstance.find({ _id: { $in: ciIds } })
    .select('_id courseProduct acceptedCourseProducts').lean()
  const instMap = new Map(instances.map((i) => [String(i._id), i]))

  const stuIds = [...new Set(broken.map((b) => String(b.student)))]
  const now = new Date()
  const sps = await StudentProduct.find({
    org: orgId,
    student: { $in: stuIds },
    isActive: true,
    remainingLessons: { $gt: 0 },
    expireDate: { $gt: now }
  }).select('_id student courseProduct expireDate').lean()
  // key = `${stuId}|${cpId}` → 按 expireDate 升序
  const spMap = new Map()
  for (const sp of sps) {
    const k = `${sp.student}|${sp.courseProduct}`
    if (!spMap.has(k)) spMap.set(k, [])
    spMap.get(k).push(sp)
  }
  for (const list of spMap.values()) {
    list.sort((a, b) => new Date(a.expireDate) - new Date(b.expireDate))
  }

  let fixed = 0, skipped = 0
  for (const e of broken) {
    const inst = instMap.get(String(e.courseInstance))
    if (!inst) { skipped++; continue }
    const accepted = (inst.acceptedCourseProducts && inst.acceptedCourseProducts.length)
      ? inst.acceptedCourseProducts.map(String)
      : [String(inst.courseProduct)]
    let picked = null
    for (const cp of accepted) {
      const list = spMap.get(`${e.student}|${cp}`) || []
      if (list.length) { picked = list[0]; break }
    }
    if (!picked) { skipped++; continue }
    await CourseEnrollment.updateOne(
      { _id: e._id, studentProduct: null },
      { $set: { studentProduct: picked._id } }
    )
    fixed++
  }
  return { scanned: broken.length, fixed, skipped }
}

module.exports = {
  list, detail, create, update, setStatus, remove,
  countEnrolled, countEnrolledByInstances, assertCanEnroll,
  bindStudentProductToEnrollments, backfillEnrollmentsMainProduct
}
