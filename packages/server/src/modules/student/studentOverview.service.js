'use strict'

/**
 * 学生详情页聚合 service (2026-08-07 新增)
 *
 * 服务两个端点:
 *   R-0408 GET /students/:id/overview     —— 一次性给出 档案 + 监护人 + 学习画像 + 家长沟通画像 + 各域计数
 *   R-0409 GET /students/:id/related/:domain —— 按域分页拉明细
 *
 * 与 User 详情页不同：Student 天然按 org 隔离, 不存在「跨机构游离」/「平台视角」问题,
 * 所以没有 resolveScope 守门 —— 仅 { org: req.orgId } 单层过滤。
 * 学员不属于当前机构一律 404 (避免泄露其他机构学员的存在, 沿用 R-0401 详情 404 口径)。
 *
 * 字段名坑（与 UserOverview 类似, 别凭直觉写）:
 *   - CourseEnrollment.studentProduct (引用 StudentProduct) / CourseEnrollment.courseInstance
 *   - LessonAttendance.student / .lessonSchedule / .status
 *   - StudentWork.uploadedBy 不是 uploader (后者是 File 的字段名)
 *   - StudentWork.archived 是软归档 flag
 *   - Order 没有 createdBy; refunds[].operator 才是「退款经办」
 *   - PointsTransaction 没有 org 维度 (PointsAccount 才按 org); 走 student 维度聚合即可
 */

const mongoose = require('mongoose')

const Student = require('@models/Student.model')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const StudentWork = require('@models/StudentWork.model')
const StudentProduct = require('@models/StudentProduct.model')
const Order = require('@models/Order.model')
const PointsTransaction = require('@models/PointsTransaction.model')
const PointsAccount = require('@models/PointsAccount.model')
const PetEvent = require('@models/PetEvent.model')

const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const parentProfile = require('@modules/parent/parent.profile')
const profileShape = require('./student.profile')

/* ───────────────────────── domain 清单 ───────────────────────── */

const DOMAINS = new Set([
  'enrollments',     // 在册开班 (CourseEnrollment)
  'lessonAttendances', // 考勤 (LessonAttendance)
  'studentProducts', // 课包 (StudentProduct)
  'orders',          // 订单 (Order)
  'works',           // 作品 (StudentWork, 仅未归档)
  'pointsTransactions', // 积分流水
  'petEvents'        // 宠物事件
])

/* ───────────────────────── 上下文解析 ────────────────────────── */

/**
 * 校验学员存在且属于当前 org, 返回 student 文档。
 * 不属于当前机构 → 404 (不是 403, 防止 IDOR 枚举)。
 */
async function resolveStudent(studentId, orgId) {
  if (!mongoose.isValidObjectId(studentId)) throw ApiError.notFound('学生不存在')
  const s = await Student.findOne({ _id: studentId, org: orgId })
    .populate('guardians', 'mobile realName avatarSvgKey')
    .populate('guardianUser', 'mobile realName')
    .populate('school', 'name type address')
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  if (!s) throw ApiError.notFound('学生不存在')
  return s
}

/* ───────────────────────── overview ──────────────────────────── */

async function overview({ studentId, orgId }) {
  const s = await resolveStudent(studentId, orgId)
  const sid = s._id
  const orgFilter = { org: new mongoose.Types.ObjectId(String(orgId)), student: sid }

  // 业务侧聚合 (Promise.all 一次性拿, 不再分多次往返)
  const [
    enrollments,         // 在册开班数
    enrollmentsArchived, // 历史开班数 (status=archived / withdrawn / cancelled / completed)
    lessonAttendances,   // 考勤总数
    lessonAttendancesUpcoming, // 待上 (>= now, status=scheduled/preparing/in_progress)
    studentProducts,     // 课包总数
    studentProductsActive, // 有效课包 (isActive && remainingLessons > 0)
    orders,              // 订单总数
    works,               // 作品总数 (未归档)
    pointsBalance,       // 积分余额 (跨 org 求和 — 与 R-0473 listMyKidsStats 一致)
    petEvents            // 宠物事件总数
  ] = await Promise.all([
    CourseEnrollment.countDocuments({ ...orgFilter, status: 'enrolled' }),
    CourseEnrollment.countDocuments({ ...orgFilter, status: { $ne: 'enrolled' } }),
    LessonAttendance.countDocuments({ ...orgFilter }),
    LessonAttendance.countDocuments({ ...orgFilter, plannedStartTime: { $gte: new Date() }, status: { $nin: ['cancelled', 'archived'] } }),
    StudentProduct.countDocuments({ ...orgFilter }),
    StudentProduct.countDocuments({ ...orgFilter, isActive: true, remainingLessons: { $gt: 0 } }),
    Order.countDocuments({ ...orgFilter }),
    StudentWork.countDocuments({ ...orgFilter, archived: false }),
    PointsAccount.aggregate([
      { $match: { student: sid } },
      { $group: { _id: null, total: { $sum: '$balance' } } }
    ]).then((r) => (r[0] ? r[0].total : 0)).catch(() => 0),
    PetEvent.countDocuments({ ...orgFilter })
  ])

  // 家长沟通画像: 与 R-0401 detail() 同口径 —— guardians[0] 主监护人 → User.mobile → Parent
  const primaryGuardian = (s.guardians && s.guardians[0]) || s.guardianUser
  const guardianMobile = primaryGuardian && typeof primaryGuardian === 'object' ? (primaryGuardian.mobile || '') : ''
  let parentId = null
  let parentProfileOut = null
  if (guardianMobile) {
    const Parent = require('@models/Parent.model')
    const parent = await Parent.findOne({ org: orgId, phone: guardianMobile })
      .populate('profileLastUpdatedBy', 'realName')
      .lean()
    if (parent) {
      parentId = String(parent._id)
      parentProfileOut = parentProfile.shapeProfile(parent)
    }
  }

  return {
    profile: toProfile(s),
    counters: {
      enrollments,
      enrollmentsArchived,
      lessonAttendances,
      lessonAttendancesUpcoming,
      studentProducts,
      studentProductsActive,
      orders,
      works,
      pointsBalance,
      petEvents
    },
    parentId,
    parentProfile: parentProfileOut
  }
}

/** Student 文档 → 详情页档案区 */
function toProfile(s) {
  return {
    id: String(s._id),
    org: String(s.org),
    name: s.name,
    gender: s.gender || null,
    birthday: s.birthday || null,
    avatarSvgKey: s.avatarSvgKey || null,
    school: s.school ? { id: String(s.school._id || s.school), name: s.school.name, type: s.school.type, address: s.school.address } : null,
    grade: s.grade || '',
    className: s.className || '',
    notes: s.notes || '',
    isActive: s.isActive !== false,
    isBlocked: !!s.isBlocked,
    blockedAt: s.blockedAt || null,
    blockedReason: s.blockedReason || null,
    guardians: (s.guardians || []).map((g) => ({
      id: String(g._id || g.id || g),
      mobile: (g && typeof g === 'object') ? (g.mobile || '') : '',
      realName: (g && typeof g === 'object') ? (g.realName || '') : '',
      avatarSvgKey: (g && typeof g === 'object') ? (g.avatarSvgKey || null) : null
    })),
    guardianUser: s.guardianUser ? String(s.guardianUser._id || s.guardianUser.id || s.guardianUser) : null,
    learningProfile: profileShape.shapeProfile(s),
    createdAt: s.createdAt,
    updatedAt: s.updatedAt
  }
}

/* ───────────────────────── related ───────────────────────────── */

function paged(items, total, p) {
  return { items, total, page: p.page, pageSize: p.pageSize }
}

/* 1. 在册开班 (含历史) */
async function listEnrollments(sid, orgFilter, p) {
  const filter = { ...orgFilter, student: sid }
  const [rows, total] = await Promise.all([
    CourseEnrollment.find(filter)
      .populate('org', 'name')
      .populate({ path: 'courseInstance', select: 'name status startDate estimatedEndDate deletedAt courseProduct subject', populate: [
        { path: 'courseProduct', select: 'name' },
        { path: 'subject', select: 'name' }
      ] })
      .select('student courseInstance status enrolledAt withdrawnAt org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    CourseEnrollment.countDocuments(filter)
  ])
  return paged(
    rows.map((e) => ({
      id: String(e._id),
      courseInstance: e.courseInstance
        ? {
            id: String(e.courseInstance._id),
            name: e.courseInstance.name || (e.courseInstance.courseProduct && e.courseInstance.courseProduct.name) || '',
            courseProduct: e.courseInstance.courseProduct ? e.courseInstance.courseProduct.name : null,
            subject: e.courseInstance.subject ? e.courseInstance.subject.name : null,
            status: e.courseInstance.status,
            deletedAt: e.courseInstance.deletedAt || null,
            startDate: e.courseInstance.startDate || null,
            estimatedEndDate: e.courseInstance.estimatedEndDate || null
          }
        : null,
      status: e.status,
      enrolledAt: e.enrolledAt || null,
      withdrawnAt: e.withdrawnAt || null,
      org: e.org ? { id: String(e.org._id), name: e.org.name } : null
    })),
    total,
    p
  )
}

/* 2. 考勤 (按 plannedStartTime 倒序, 近期在前) */
async function listLessonAttendances(sid, orgFilter, p) {
  const filter = { ...orgFilter, student: sid }
  const [rows, total] = await Promise.all([
    LessonAttendance.find(filter)
      .populate('org', 'name')
      .populate('lessonSchedule', 'title plannedStartTime plannedEndTime lessonNo status')
      .select('student lessonSchedule status evaluation org createdAt updatedAt')
      .sort({ plannedStartTime: -1, updatedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    LessonAttendance.countDocuments(filter)
  ])
  return paged(
    rows.map((a) => ({
      id: String(a._id),
      lesson: a.lessonSchedule
        ? {
            id: String(a.lessonSchedule._id),
            title: a.lessonSchedule.title || '',
            lessonNo: a.lessonSchedule.lessonNo,
            status: a.lessonSchedule.status,
            plannedStartTime: a.lessonSchedule.plannedStartTime,
            plannedEndTime: a.lessonSchedule.plannedEndTime || null
          }
        : null,
      status: a.status,
      evaluated: !!(a.evaluation && a.evaluation.evaluatedBy),
      evaluatedAt: (a.evaluation && a.evaluation.evaluatedAt) || null,
      org: a.org ? { id: String(a.org._id), name: a.org.name } : null
    })),
    total,
    p
  )
}

/* 3. 课包 (剩余 > 0 的置顶, 然后按 giftedAt/createdAt 倒序) */
async function listStudentProducts(sid, orgFilter, p) {
  const filter = { ...orgFilter, student: sid }
  const [rows, total] = await Promise.all([
    StudentProduct.find(filter)
      .populate('org', 'name')
      .populate('courseProduct', 'name')
      .select('student courseProduct totalLessons remainingLessons expireDate giftReason giftedAt giftedBy isActive source org')
      .sort({ isActive: -1, remainingLessons: -1, createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    StudentProduct.countDocuments(filter)
  ])
  return paged(
    rows.map((sp) => ({
      id: String(sp._id),
      courseProduct: sp.courseProduct ? sp.courseProduct.name : null,
      totalLessons: sp.totalLessons,
      remainingLessons: sp.remainingLessons,
      used: sp.totalLessons - sp.remainingLessons,
      isActive: sp.isActive !== false,
      source: sp.source || '',
      giftReason: sp.giftReason || '',
      giftedAt: sp.giftedAt || null,
      expireDate: sp.expireDate || null,
      org: sp.org ? { id: String(sp.org._id), name: sp.org.name } : null
    })),
    total,
    p
  )
}

/* 4. 订单 (按 createdAt 倒序) */
async function listOrders(sid, orgFilter, p) {
  const filter = { ...orgFilter, student: sid }
  const [rows, total] = await Promise.all([
    Order.find(filter)
      .populate('org', 'name')
      .populate('items.courseProduct', 'name')
      .select('student status actualPrice totalPrice paidAmount refundedAmount items paidAt refundedAt org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Order.countDocuments(filter)
  ])
  return paged(
    rows.map((o) => ({
      id: String(o._id),
      status: o.status,
      totalPrice: o.totalPrice,
      actualPrice: o.actualPrice,
      paidAmount: o.paidAmount || 0,
      refundedAmount: o.refundedAmount || 0,
      paidAt: o.paidAt || null,
      refundedAt: o.refundedAt || null,
      items: (o.items || []).map((it) => ({
        courseProduct: it.courseProduct ? it.courseProduct.name : null,
        quantity: it.quantity || 1,
        unitPrice: it.unitPrice,
        subtotal: it.subtotal
      })),
      org: o.org ? { id: String(o.org._id), name: o.org.name } : null,
      createdAt: o.createdAt
    })),
    total,
    p
  )
}

/* 5. 作品 (仅未归档) */
async function listWorks(sid, orgFilter, p) {
  const filter = { ...orgFilter, student: sid, archived: false }
  const [rows, total] = await Promise.all([
    StudentWork.find(filter)
      .populate('org', 'name')
      .populate('subject', 'name')
      .populate('uploadedBy', 'realName')
      .select('title student subject level rating status uploadedBy org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    StudentWork.countDocuments(filter)
  ])
  return paged(
    rows.map((w) => ({
      id: String(w._id),
      title: w.title,
      subject: w.subject ? w.subject.name : null,
      level: w.level || null,
      rating: w.rating || null,
      status: w.status,
      uploadedBy: w.uploadedBy ? w.uploadedBy.realName : null,
      org: w.org ? { id: String(w.org._id), name: w.org.name } : null,
      createdAt: w.createdAt
    })),
    total,
    p
  )
}

/* 6. 积分流水 (PointsTransaction 没有 org 字段, 用 student 维度, 不加 org 过滤; 跨 org 一齐列) */
async function listPointsTransactions(sid, _orgFilter, p) {
  const filter = { student: sid }
  const [rows, total] = await Promise.all([
    PointsTransaction.find(filter)
      .populate('org', 'name')
      .select('type amount balance reason org occurredAt createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    PointsTransaction.countDocuments(filter)
  ])
  return paged(
    rows.map((t) => ({
      id: String(t._id),
      type: t.type,
      amount: t.amount,
      balance: t.balance,
      reason: t.reason || '',
      org: t.org ? { id: String(t.org._id), name: t.org.name } : null,
      occurredAt: t.occurredAt || t.createdAt
    })),
    total,
    p
  )
}

/* 7. 宠物事件 (按 createdAt 倒序) */
async function listPetEvents(sid, orgFilter, p) {
  const filter = { ...orgFilter, student: sid }
  const [rows, total] = await Promise.all([
    PetEvent.find(filter)
      .populate('org', 'name')
      .select('type title detail student org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    PetEvent.countDocuments(filter)
  ])
  return paged(
    rows.map((e) => ({
      id: String(e._id),
      type: e.type,
      title: e.title || '',
      detail: e.detail || '',
      org: e.org ? { id: String(e.org._id), name: e.org.name } : null,
      createdAt: e.createdAt
    })),
    total,
    p
  )
}

const HANDLERS = {
  enrollments: listEnrollments,
  lessonAttendances: listLessonAttendances,
  studentProducts: listStudentProducts,
  orders: listOrders,
  works: listWorks,
  pointsTransactions: listPointsTransactions,
  petEvents: listPetEvents
}

async function related({ studentId, orgId, domain, page, pageSize }) {
  if (!DOMAINS.has(domain)) throw ApiError.badRequest(`不支持的域: ${domain}`)
  // 越权守门 —— 学员不属于当前机构时返 404, 同 R-0401 口径
  await resolveStudent(studentId, orgId)
  const p = normalizePagination({ page, pageSize })
  const orgFilter = { org: new mongoose.Types.ObjectId(String(orgId)) }
  return HANDLERS[domain](new mongoose.Types.ObjectId(String(studentId)), orgFilter, p)
}

module.exports = { overview, related, DOMAINS }
