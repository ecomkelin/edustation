'use strict'

const StudentProduct = require('@models/StudentProduct.model')
const CourseProduct = require('@models/CourseProduct.model')
const Student = require('@models/Student.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const { StudentProductSource } = require('@shared/enums')

async function list({ orgId, student, isActive, source, page, pageSize }) {
  const filter = { org: orgId }
  if (student) filter.student = student
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  if (source) filter.source = source

  const ps = Math.max(1, Math.min(200, parseInt(pageSize, 10) || 20))
  const p = Math.max(1, parseInt(page, 10) || 1)

  const [items, total] = await Promise.all([
    StudentProduct.find(filter)
      .populate('student', 'name')
      .populate('courseProduct', 'name totalLessons validDays discountPrice promotionPrice')
      .populate('order', 'status paidAmount')
      .populate('giftedBy', 'realName mobile')
      .sort({ createdAt: -1 })
      .skip((p - 1) * ps)
      .limit(ps)
      .lean(),
    StudentProduct.countDocuments(filter)
  ])

  return { items, total, page: p, pageSize: ps }
}

async function detail(id, orgId) {
  const sp = await StudentProduct.findOne({ _id: id, org: orgId })
    .populate('student courseProduct order giftedBy')
    .lean()
  if (!sp) throw ApiError.notFound('学生持有的产品不存在')
  return sp
}

async function remaining(id, orgId) {
  const sp = await StudentProduct.findOne({ _id: id, org: orgId }).select('_id remainingLessons totalLessons expireDate isActive source giftReason').lean()
  if (!sp) throw ApiError.notFound('学生持有的产品不存在')
  return sp
}

/**
 * 赠课：员工直接为学生创建 StudentProduct（不走订单支付）。
 *
 * - 必须拥有 studentProduct.gift 权限（由 route 层 requirePermission 强制）
 * - source='gift' 必填；giftReason 必填；giftedBy = 当前登录用户；giftedAt = now
 * - totalLessons/expireDate 从 CourseProduct 拷贝（与订单支付同口径）
 */
async function gift({ orgId, operatorId, student, courseProduct, totalLessons, expireDate, giftReason }) {
  if (!student) throw ApiError.badRequest('student 必填')
  if (!courseProduct) throw ApiError.badRequest('courseProduct 必填')
  if (!giftReason || !giftReason.trim()) throw ApiError.badRequest('giftReason 必填（写明赠课原因）')

  if (!await Student.exists({ _id: student, org: orgId })) {
    throw ApiError.badRequest('学生不存在或不属于本机构')
  }
  const p = await CourseProduct.findOne({ _id: courseProduct, org: orgId, isActive: true }).lean()
  if (!p) throw ApiError.badRequest('课程产品不存在或已下架')

  // totalLessons / expireDate 不传时回落到 CourseProduct 默认
  const finalTotal = totalLessons != null ? totalLessons : p.totalLessons
  if (finalTotal <= 0) throw ApiError.badRequest('totalLessons 必须 >= 1')

  let finalExpire
  if (expireDate) {
    finalExpire = new Date(expireDate)
  } else {
    finalExpire = new Date(Date.now() + p.validDays * 24 * 60 * 60 * 1000)
  }

  const sp = await StudentProduct.create({
    org: orgId,
    student,
    source: StudentProductSource.GIFT,
    order: null,
    courseProduct: p._id,
    totalLessons: finalTotal,
    remainingLessons: finalTotal,
    expireDate: finalExpire,
    isActive: true,
    giftReason: giftReason.trim(),
    giftedBy: operatorId,
    giftedAt: new Date()
  })

  // ★回填主用课包：把刚赠的 SP 写回到该学生在「接受此 courseProduct 且
  //   主用课包为空」的已存在 enrolled 报名上。
  //   不会覆盖教务在「报名管理」里手动指定过的主用课包。
  try {
    const courseEnrollmentService = require('@modules/courseEnrollment/courseEnrollment.service')
    await courseEnrollmentService.bindStudentProductToEnrollments({
      orgId, student, studentProductId: sp._id, courseProduct: p._id
    })
  } catch (_) { /* 单条回填失败不阻断 gift 返回 */ }

  // 赠课后不自动补 LessonAttendance。
  // 业务语义（2026-06 修订）：LessonAttendance 仅在 LessonSchedule 「未上课 → 准备上课」
  //   切换时由 lessonSchedule.service.prepare() 一次性生成。
  //   赠课只负责产出 StudentProduct + 反向绑定 CourseEnrollment.studentProduct，
  //   下一次该开班的 prepare() 会自然把该学生纳入考勤名单。

  return detail(sp._id, orgId)
}

/**
 * 今日工作台 (2026-06-23 AI 助手接入): 剩余课时不足阈值的活跃课包
 *  - threshold 默认 3 (>=0 且 <=threshold 视为不足)
 *  - 仅 isActive=true 的课包
 *  - 按 student 聚合, 每个学生只输出 1 行 (取最低 remainingLessons 的课包代表)
 *    (避免一个学生有 5 个 1 课时的小课包时输出 5 行)
 *  - 排序: remainingLessons 升序 (越少越靠前), tie 时按 updatedAt desc
 *  - 返回 { threshold, items, count }
 */
async function listLowRemaining({ orgId, threshold = 3, limit = 50 }) {
  const t = Math.max(0, Number(threshold) || 0)
  const items = await StudentProduct.find({
    org: orgId,
    isActive: true,
    remainingLessons: { $lte: t }
  })
    .populate('student', 'name')
    .populate('courseProduct', 'name')
    .sort({ remainingLessons: 1, updatedAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .lean()

  // 派生: 每个学生的活跃课包总数 (用于 LLM 自然语言: "还有 N 个活跃课包")
  const studentIds = [...new Set(items.map((i) => String(i.student?._id)).filter(Boolean))]
  const StudentProduct = require('@models/StudentProduct.model')
  const mongoose = require('mongoose')
  const orgOid = mongoose.Types.ObjectId.createFromHexString(String(orgId))
  const studentOids = studentIds
    .filter((s) => mongoose.Types.ObjectId.isValid(s))
    .map((s) => mongoose.Types.ObjectId.createFromHexString(s))
  const totals = studentOids.length
    ? await StudentProduct.aggregate([
        { $match: { org: orgOid, student: { $in: studentOids }, isActive: true } },
        { $group: { _id: '$student', total: { $sum: 1 } } }
      ])
    : []
  const tMap = new Map(totals.map((t) => [String(t._id), t.total]))

  // 派生: 监护人手机号 (用于沟通)
  const Student = require('@models/Student.model')
  const students = studentIds.length
    ? await Student.find({ _id: { $in: studentIds } })
        .populate('guardians', 'mobile')
        .lean()
    : []
  const sMap = new Map(students.map((s) => [String(s._id), s]))

  return {
    threshold: t,
    items: items.map((p) => {
      const s = sMap.get(String(p.student?._id))
      const guardianMobile = s?.guardians?.[0]?.mobile || null
      return {
        studentId: p.student?._id,
        studentName: p.student?.name || null,
        courseProductName: p.courseProduct?.name || null,
        remainingLessons: p.remainingLessons,
        totalLessons: p.totalLessons,
        expireDate: p.expireDate,
        activePackCount: tMap.get(String(p.student?._id)) || 0,
        guardianMobile
      }
    }),
    count: items.length
  }
}

/**
 * 互锁检查声明（与 remove / removableCheck 共用同一组，单点维护）
 * - LessonAttendance.studentProduct == spId：该课包已被排课消课引用（含 scheduled /
 *   checked_in / completed / madeup 全状态），考勤是审计凭证，物理删除 SP 会导致
 *   考勤的消课引用悬空，因此必挡。
 * - CourseEnrollment.studentProduct == spId：该课包是某报名的「主用课包」（排课时优先
 *   消此包），物理删除会断绑定。业务上让员工先在「报名管理」解绑主用课包，再删 SP。
 * - source='gift' 也走同一套互锁（无豁免；只是 gift 无 order 引用，仅受上面两项约束）。
 */
function studentProductUsageChecks(orgId, spId) {
  return [
    {
      model: LessonAttendance,
      filter: { org: orgId, studentProduct: spId },
      label: '考勤记录',
      hint: '该课包已被考勤引用（含排课中/已消课），请先在「考勤」里改派其他课包或归档后再删'
    },
    {
      model: CourseEnrollment,
      filter: { org: orgId, studentProduct: spId },
      label: '报名主用课包绑定',
      hint: '有报名以该课包为主用课包，请先在「报名管理」中解绑主用课包后再删'
    }
  ]
}

/**
 * 物理删除学员课包（2026-06-25 立项）
 *
 * 门控：
 *   1. requirePlatformPassword（路由层）：超管 + 自身密码
 *   2. assertUnused：LessonAttendance + CourseEnrollment 引用必须 count=0
 *
 * 失败响应：
 *   - assertUnused 失败 → ApiError.unprocessable（422）+ data.blockers
 *   - 不存在 → ApiError.notFound（404）
 *
 * 注意：不主动清 CourseProduct / Order 反向引用（SP 是被引用方，引用方不应依赖 SP 存在）
 */
async function remove(id, orgId) {
  const sp = await StudentProduct.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!sp) throw ApiError.notFound('学生课包不存在')

  await removable.assertUnused(orgId, studentProductUsageChecks(orgId, id))

  await StudentProduct.deleteOne({ _id: id, org: orgId })
  return { success: true, id }
}

/**
 * 删除预检（2026-06-25 立项）
 *
 * 与 remove 走同一组 studentProductUsageChecks（单点维护），保证挡板与实际删除语义一致。
 */
async function removableCheck(id, orgId) {
  const sp = await StudentProduct.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!sp) {
    return {
      canRemove: false,
      blockers: [{ entity: 'StudentProduct', label: '学生课包', count: 0, hint: '该学生课包不存在或不属于本机构' }]
    }
  }
  return removable.check(orgId, studentProductUsageChecks(orgId, id))
}

module.exports = { list, detail, remaining, gift, listLowRemaining, remove, removableCheck }
