'use strict'

const StudentProduct = require('@models/StudentProduct.model')
const CourseProduct = require('@models/CourseProduct.model')
const Student = require('@models/Student.model')
const ApiError = require('@utils/ApiError')
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

module.exports = { list, detail, remaining, gift }
