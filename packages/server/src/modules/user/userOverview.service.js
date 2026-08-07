'use strict'

/**
 * 用户详情页聚合 service (2026-08-07 新增)
 *
 * 服务两个端点:
 *   R-0217 GET /users/:id/overview            —— 一次性给出 档案 + 机构职位 + 有效权限 + 各域计数
 *   R-0218 GET /users/:id/related/:domain     —— 按域分页拉明细
 *
 * ─── 可见性 (最重要的一条) ─────────────────────────────
 * 本项目是 SaaS 多租户 (CLAUDE.md §1), User 又是唯一一个天然跨机构的实体
 * (一个人可以同时在 A/B 两家机构任职)。所以这里必须区分两种视角:
 *
 *   scope='platform' (isPlatformAdmin)  —— 不加 org 过滤, 看该用户在全平台的全部痕迹
 *   scope='org'      (机构管理员)        —— 一律 { org: req.orgId }, 且:
 *                                          · orgs[] 只返回当前机构那一条 (连"他还在别家"都不暴露)
 *                                          · sessions / audit 两个域直接 403 (无 org 维度, 天然跨机构)
 *
 * 目标用户不属于当前机构时一律 404 (不是 403) —— 沿用 2026-08-05 审计 S1 给
 * R-0206 lookup 定的口径: 403 会泄露"这个手机号在别家存在", 可被用来枚举。
 *
 * ─── 字段名坑 (历史遗留, 别凭直觉写) ────────────────────
 *   StudentWork.uploadedBy   vs   File.uploader
 *   Task.creator             vs   ChildLead/Parent/TrialBooking.createdBy
 *   LessonAttendance 的课评人在 `evaluation.evaluatedBy` (嵌套), 不是顶层 evaluatedBy
 *   Order 没有 createdBy / 销售字段, 只有 refunds[].operator
 */

const mongoose = require('mongoose')

const User = require('@models/User.model')
const UserOrgRel = require('@models/UserOrgRel.model')
const Student = require('@models/Student.model')
const CourseInstance = require('@models/CourseInstance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const StudentWork = require('@models/StudentWork.model')
const StudentProduct = require('@models/StudentProduct.model')
const Task = require('@models/Task.model')
const Parent = require('@models/Parent.model')
const ChildLead = require('@models/ChildLead.model')
const TrialBooking = require('@models/TrialBooking.model')
const FinanceTransaction = require('@models/FinanceTransaction.model')
const Order = require('@models/Order.model')
// 注意: File.model.js 导出的是 { File, FILE_SCOPE, REF_ENTITY }, 不是 model 本身
const { File } = require('@models/File.model')
const UserConsent = require('@models/UserConsent.model')
const RefreshToken = require('@models/RefreshToken.model')
const AuditLog = require('@models/AuditLog.model')

const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const { DEFAULT_USER_AVATAR_KEY } = require('@shared/avatars')

/** 仅平台超管可见的域: 这两张表没有 org 维度, 机构视角下无法安全裁剪 */
const PLATFORM_ONLY_DOMAINS = new Set(['sessions', 'audit'])

const DOMAINS = new Set([
  'students',
  'courseInstances',
  'lessonSchedules',
  'evaluations',
  'works',
  'tasks',
  'parents',
  'childLeads',
  'trialBookings',
  'financeTx',
  'giftedProducts',
  'refunds',
  'files',
  'consents',
  'sessions',
  'audit'
])

/**
 * 解析可见性上下文。overview / related 共用, 是唯一的越权守门点。
 *
 * @returns {{ scope:'platform'|'org', targetUser, rels:Array, orgFilter:object }}
 *   orgFilter 直接展开到各业务查询里: platform 视角是 {}, 机构视角是 { org: ObjectId }
 */
async function resolveScope({ userId, orgId, isPlatformAdmin }) {
  if (!mongoose.isValidObjectId(userId)) throw ApiError.notFound('用户不存在')

  const targetUser = await User.findById(userId)
    .populate('region', 'name level')
    .select(
      'mobile realName avatarSvgKey idCard region isPlatformAdmin isActive isBlocked ' +
        'blockedAt blockedReason requirePasswordChange wechatOpenId wechatUnionId createdAt updatedAt'
    )
    .lean()
  if (!targetUser) throw ApiError.notFound('用户不存在')

  const allRels = await UserOrgRel.find({ user: userId })
    .populate('org', 'name type isActive')
    .populate('positions', 'name permissions isSystem clientLevel')
    .sort({ isMain: -1, createdAt: 1 })
    .lean()

  if (isPlatformAdmin) {
    // 平台视角: 不加 org 过滤。游离用户 (allRels 为空) 也能看到其在各机构的历史痕迹,
    // 这正是"为什么这个账号变成游离的"最需要的信息。
    return { scope: 'platform', targetUser, rels: allRels, orgFilter: {} }
  }

  // 机构视角: 必须先证明目标用户属于当前机构
  if (!orgId) throw ApiError.notFound('用户不存在')
  const mine = allRels.filter((r) => r.org && String(r.org._id) === String(orgId))
  if (!mine.length) throw ApiError.notFound('用户不存在')

  return {
    scope: 'org',
    targetUser,
    rels: mine,
    orgFilter: { org: new mongoose.Types.ObjectId(String(orgId)) }
  }
}

/** User 文档 → 详情页档案区。idCard 原样下发 (前端掩码), wechat 只给 bool 不给 openId 明文 */
function toProfile(u, lastActiveAt) {
  return {
    id: String(u._id),
    mobile: u.mobile,
    realName: u.realName || '',
    avatarSvgKey: u.avatarSvgKey || DEFAULT_USER_AVATAR_KEY,
    idCard: u.idCard || null,
    region: u.region ? { id: String(u.region._id), name: u.region.name } : null,
    isPlatformAdmin: !!u.isPlatformAdmin,
    isActive: u.isActive !== false,
    isBlocked: !!u.isBlocked,
    blockedAt: u.blockedAt || null,
    blockedReason: u.blockedReason || null,
    requirePasswordChange: !!u.requirePasswordChange,
    wechat: { openIdBound: !!u.wechatOpenId, unionIdBound: !!u.wechatUnionId },
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    lastActiveAt
  }
}

/** UserOrgRel[] → orgs[]。scope=org 时调用方已把 rels 裁到只剩当前机构 */
function toOrgs(rels) {
  return rels
    .filter((r) => r.org)
    .map((r) => ({
      id: String(r.org._id),
      name: r.org.name,
      type: r.org.type,
      isActive: r.org.isActive !== false,
      isMain: !!r.isMain,
      showAsTeacher: !!r.showAsTeacher,
      joinedAt: r.createdAt,
      positions: (r.positions || []).map((p) => ({
        id: String(p._id),
        name: p.name,
        isSystem: !!p.isSystem,
        clientLevel: Number(p.clientLevel) || 0,
        permissions: p.permissions || []
      }))
    }))
}

/**
 * 有效权限。
 * - 平台超管: 前端直接显示"全部权限", 不列码
 * - 机构管理员视角: 只聚合当前机构的 positions
 * - 平台视角看普通用户: 聚合其全部机构的 positions (前端会按机构分组展示)
 */
function toEffectivePermissions(targetUser, rels) {
  if (targetUser.isPlatformAdmin) return { isPlatformAdmin: true, codes: [] }
  const set = new Set()
  for (const r of rels) {
    for (const p of r.positions || []) {
      for (const code of p.permissions || []) set.add(code)
    }
  }
  return { isPlatformAdmin: false, codes: [...set].sort() }
}

/* ────────────────────────────── overview ────────────────────────────── */

async function overview({ userId, orgId, isPlatformAdmin }) {
  const { scope, targetUser, rels, orgFilter } = await resolveScope({
    userId,
    orgId,
    isPlatformAdmin
  })
  const uid = targetUser._id
  const isPlatform = scope === 'platform'

  const [
    students,
    courseInstances,
    lessonSchedules,
    evaluations,
    works,
    tasksAssigned,
    tasksSupervised,
    tasksCreated,
    parents,
    childLeads,
    trialBookings,
    financeTx,
    giftedProducts,
    refunds,
    files,
    consents,
    sessions,
    auditLogs,
    lastSession
  ] = await Promise.all([
    Student.countDocuments({ ...orgFilter, $or: [{ guardianUser: uid }, { guardians: uid }] }),
    CourseInstance.countDocuments({ ...orgFilter, teacher: uid, deletedAt: null }),
    LessonSchedule.countDocuments({ ...orgFilter, teacher: uid, status: { $ne: 'archived' } }),
    LessonAttendance.countDocuments({ ...orgFilter, 'evaluation.evaluatedBy': uid }),
    StudentWork.countDocuments({ ...orgFilter, uploadedBy: uid, archived: false }),
    Task.countDocuments({ ...orgFilter, 'assignees.user': uid, archived: false }),
    Task.countDocuments({ ...orgFilter, supervisors: uid, archived: false }),
    Task.countDocuments({ ...orgFilter, creator: uid, archived: false }),
    Parent.countDocuments({
      ...orgFilter,
      $or: [{ promoteBy: uid }, { createdBy: uid }, { lastContactedBy: uid }]
    }),
    ChildLead.countDocuments({
      ...orgFilter,
      $or: [{ createdBy: uid }, { inviteTeacher: uid }, { lastContactedBy: uid }]
    }),
    TrialBooking.countDocuments({
      ...orgFilter,
      $or: [{ teacher: uid }, { consultant: uid }, { createdBy: uid }]
    }),
    FinanceTransaction.countDocuments({ ...orgFilter, operator: uid }),
    StudentProduct.countDocuments({ ...orgFilter, giftedBy: uid }),
    Order.countDocuments({ ...orgFilter, 'refunds.operator': uid }),
    File.countDocuments({ ...orgFilter, uploader: uid, deletedAt: null }),
    // UserConsent 无 org 维度: 协议签署是账号事实, 两种视角一致
    UserConsent.countDocuments({ user: uid }),
    // 会话 / 审计仅平台视角计数, 机构视角给 null (前端据此隐藏整个 tab)
    isPlatform
      ? RefreshToken.countDocuments({ user: uid, isRevoked: false, expiresAt: { $gt: new Date() } })
      : Promise.resolve(null),
    isPlatform ? AuditLog.countDocuments({ 'actor._id': uid }) : Promise.resolve(null),
    // "最近活跃": User 上没有 lastLoginAt 字段, 也没有 LoginLog 表,
    //   只能用最新一条 refresh token 的签发时间近似 (登录 / 刷新都会写)
    RefreshToken.findOne({ user: uid }).sort({ createdAt: -1 }).select('createdAt').lean()
  ])

  return {
    scope,
    profile: toProfile(targetUser, lastSession ? lastSession.createdAt : null),
    orgs: toOrgs(rels),
    effectivePermissions: toEffectivePermissions(targetUser, rels),
    counters: {
      students,
      courseInstances,
      lessonSchedules,
      evaluations,
      works,
      tasksAssigned,
      tasksSupervised,
      tasksCreated,
      parents,
      childLeads,
      trialBookings,
      financeTx,
      giftedProducts,
      refunds,
      files,
      consents,
      sessions,
      auditLogs
    }
  }
}

/* ────────────────────────────── related ────────────────────────────── */

/** 所有域统一的返回形状 */
function paged(items, total, p) {
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function listStudents(uid, orgFilter, p) {
  const filter = { ...orgFilter, $or: [{ guardianUser: uid }, { guardians: uid }] }
  const [rows, total] = await Promise.all([
    Student.find(filter)
      .populate('org', 'name')
      .populate('school', 'name')
      .select('name gender birthday grade className isActive isBlocked guardianUser org school createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Student.countDocuments(filter)
  ])
  return paged(
    rows.map((s) => ({
      id: String(s._id),
      name: s.name,
      gender: s.gender || null,
      birthday: s.birthday || null,
      grade: s.grade || '',
      className: s.className || '',
      isActive: s.isActive !== false,
      isBlocked: !!s.isBlocked,
      // 主监护人 vs 普通监护人: 家长端默认进入的孩子是主监护人那个
      isPrimaryGuardian: String(s.guardianUser || '') === String(uid),
      school: s.school ? { id: String(s.school._id), name: s.school.name } : null,
      org: s.org ? { id: String(s.org._id), name: s.org.name } : null,
      createdAt: s.createdAt
    })),
    total,
    p
  )
}

async function listCourseInstances(uid, orgFilter, p) {
  const filter = { ...orgFilter, teacher: uid, deletedAt: null }
  const [rows, total] = await Promise.all([
    CourseInstance.find(filter)
      .populate('org', 'name')
      .populate('courseProduct', 'name')
      .populate('subject', 'name')
      .select('name status startDate estimatedEndDate courseProduct subject org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    CourseInstance.countDocuments(filter)
  ])
  return paged(
    rows.map((c) => ({
      id: String(c._id),
      name: c.name || (c.courseProduct && c.courseProduct.name) || '',
      courseProduct: c.courseProduct ? c.courseProduct.name : null,
      subject: c.subject ? c.subject.name : null,
      status: c.status,
      startDate: c.startDate || null,
      estimatedEndDate: c.estimatedEndDate || null,
      org: c.org ? { id: String(c.org._id), name: c.org.name } : null
    })),
    total,
    p
  )
}

async function listLessonSchedules(uid, orgFilter, p) {
  const filter = { ...orgFilter, teacher: uid, status: { $ne: 'archived' } }
  const [rows, total] = await Promise.all([
    LessonSchedule.find(filter)
      .populate('org', 'name')
      .populate({ path: 'courseInstance', select: 'name courseProduct', populate: { path: 'courseProduct', select: 'name' } })
      .select('title lessonNo status plannedStartTime plannedEndTime courseInstance org')
      .sort({ plannedStartTime: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    LessonSchedule.countDocuments(filter)
  ])
  return paged(
    rows.map((l) => ({
      id: String(l._id),
      title: l.title || '',
      lessonNo: l.lessonNo,
      status: l.status,
      plannedStartTime: l.plannedStartTime,
      plannedEndTime: l.plannedEndTime || null,
      courseInstance: l.courseInstance
        ? {
            id: String(l.courseInstance._id),
            name:
              l.courseInstance.name ||
              (l.courseInstance.courseProduct && l.courseInstance.courseProduct.name) ||
              ''
          }
        : null,
      org: l.org ? { id: String(l.org._id), name: l.org.name } : null
    })),
    total,
    p
  )
}

async function listEvaluations(uid, orgFilter, p) {
  // 注意: 课评人在 evaluation.evaluatedBy (嵌套), 不是顶层 evaluatedBy
  const filter = { ...orgFilter, 'evaluation.evaluatedBy': uid }
  const [rows, total] = await Promise.all([
    LessonAttendance.find(filter)
      .populate('org', 'name')
      .populate('student', 'name')
      .populate('lessonSchedule', 'title plannedStartTime lessonNo')
      .select('student lessonSchedule status evaluation org updatedAt')
      .sort({ updatedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    LessonAttendance.countDocuments(filter)
  ])
  return paged(
    rows.map((a) => ({
      id: String(a._id),
      student: a.student ? { id: String(a.student._id), name: a.student.name } : null,
      lesson: a.lessonSchedule
        ? {
            id: String(a.lessonSchedule._id),
            title: a.lessonSchedule.title || '',
            lessonNo: a.lessonSchedule.lessonNo,
            plannedStartTime: a.lessonSchedule.plannedStartTime
          }
        : null,
      status: a.status,
      evaluatedAt: (a.evaluation && a.evaluation.evaluatedAt) || a.updatedAt,
      org: a.org ? { id: String(a.org._id), name: a.org.name } : null
    })),
    total,
    p
  )
}

async function listWorks(uid, orgFilter, p) {
  const filter = { ...orgFilter, uploadedBy: uid, archived: false }
  const [rows, total] = await Promise.all([
    StudentWork.find(filter)
      .populate('org', 'name')
      .populate('student', 'name')
      .populate('subject', 'name')
      .select('title student subject org createdAt')
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
      student: w.student ? { id: String(w.student._id), name: w.student.name } : null,
      subject: w.subject ? w.subject.name : null,
      org: w.org ? { id: String(w.org._id), name: w.org.name } : null,
      createdAt: w.createdAt
    })),
    total,
    p
  )
}

async function listTasks(uid, orgFilter, p) {
  const filter = {
    ...orgFilter,
    archived: false,
    $or: [{ creator: uid }, { 'assignees.user': uid }, { supervisors: uid }]
  }
  const [rows, total] = await Promise.all([
    Task.find(filter)
      .populate('org', 'name')
      .select('title type status priority dueAt progress creator assignees supervisors org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Task.countDocuments(filter)
  ])
  return paged(
    rows.map((t) => {
      // 同一个人可能在一个任务里身兼两职 (自己发起 + 自己执行), 所以是数组不是单值
      const roles = []
      if (String(t.creator || '') === String(uid)) roles.push('creator')
      if ((t.assignees || []).some((a) => String(a.user || '') === String(uid))) roles.push('assignee')
      if ((t.supervisors || []).some((s) => String(s || '') === String(uid))) roles.push('supervisor')
      const mine = (t.assignees || []).find((a) => String(a.user || '') === String(uid))
      return {
        id: String(t._id),
        title: t.title,
        type: t.type,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt || null,
        progress: t.progress || 0,
        roles,
        myStatus: mine ? mine.status : null,
        org: t.org ? { id: String(t.org._id), name: t.org.name } : null,
        createdAt: t.createdAt
      }
    }),
    total,
    p
  )
}

async function listParents(uid, orgFilter, p) {
  const filter = {
    ...orgFilter,
    $or: [{ promoteBy: uid }, { createdBy: uid }, { lastContactedBy: uid }]
  }
  const [rows, total] = await Promise.all([
    Parent.find(filter)
      .populate('org', 'name')
      .populate('user', 'realName')
      .select('phone lifecycle sourceDetail user promoteBy createdBy lastContactedBy lastContactedAt org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Parent.countDocuments(filter)
  ])
  return paged(
    rows.map((d) => ({
      id: String(d._id),
      // Parent 没有 name 字段 (业务唯一键是 phone); 已转化的家长才有 user.realName
      name: (d.user && d.user.realName) || '',
      phone: d.phone,
      lifecycle: d.lifecycle,
      sourceDetail: d.sourceDetail || '',
      roles: pickRoles(uid, d, { promoteBy: 'promoter', createdBy: 'creator', lastContactedBy: 'lastContact' }),
      lastContactedAt: d.lastContactedAt || null,
      org: d.org ? { id: String(d.org._id), name: d.org.name } : null,
      createdAt: d.createdAt
    })),
    total,
    p
  )
}

async function listChildLeads(uid, orgFilter, p) {
  const filter = {
    ...orgFilter,
    $or: [{ createdBy: uid }, { inviteTeacher: uid }, { lastContactedBy: uid }]
  }
  const [rows, total] = await Promise.all([
    ChildLead.find(filter)
      .populate('org', 'name')
      .populate('parent', 'phone')
      .select('name status grade createdBy inviteTeacher lastContactedBy lastContactedAt parent org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    ChildLead.countDocuments(filter)
  ])
  return paged(
    rows.map((d) => ({
      id: String(d._id),
      name: d.name,
      status: d.status,
      grade: d.grade || '',
      parent: d.parent ? { id: String(d.parent._id), phone: d.parent.phone } : null,
      roles: pickRoles(uid, d, {
        createdBy: 'creator',
        inviteTeacher: 'inviteTeacher',
        lastContactedBy: 'lastContact'
      }),
      lastContactedAt: d.lastContactedAt || null,
      org: d.org ? { id: String(d.org._id), name: d.org.name } : null,
      createdAt: d.createdAt
    })),
    total,
    p
  )
}

async function listTrialBookings(uid, orgFilter, p) {
  const filter = {
    ...orgFilter,
    $or: [{ teacher: uid }, { consultant: uid }, { createdBy: uid }]
  }
  const [rows, total] = await Promise.all([
    TrialBooking.find(filter)
      .populate('org', 'name')
      .populate('preStudent', 'name')
      .select('preStudent status scheduledAt attemptNo result teacher consultant createdBy org createdAt')
      .sort({ scheduledAt: -1, createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    TrialBooking.countDocuments(filter)
  ])
  return paged(
    rows.map((d) => ({
      id: String(d._id),
      childLead: d.preStudent ? { id: String(d.preStudent._id), name: d.preStudent.name } : null,
      status: d.status,
      attemptNo: d.attemptNo,
      scheduledAt: d.scheduledAt || null,
      outcome: (d.result && d.result.outcome) || null,
      roles: pickRoles(uid, d, { teacher: 'teacher', consultant: 'consultant', createdBy: 'creator' }),
      org: d.org ? { id: String(d.org._id), name: d.org.name } : null,
      createdAt: d.createdAt
    })),
    total,
    p
  )
}

async function listFinanceTx(uid, orgFilter, p) {
  const filter = { ...orgFilter, operator: uid }
  const [rows, total] = await Promise.all([
    FinanceTransaction.find(filter)
      .populate('org', 'name')
      .populate('account', 'name')
      .populate('reason', 'name')
      .select('type amount occurredAt remark account reason org')
      .sort({ occurredAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    FinanceTransaction.countDocuments(filter)
  ])
  return paged(
    rows.map((t) => ({
      id: String(t._id),
      type: t.type,
      amount: t.amount,
      occurredAt: t.occurredAt,
      account: t.account ? t.account.name : null,
      reason: t.reason ? t.reason.name : null,
      remark: t.remark || '',
      org: t.org ? { id: String(t.org._id), name: t.org.name } : null
    })),
    total,
    p
  )
}

async function listGiftedProducts(uid, orgFilter, p) {
  const filter = { ...orgFilter, giftedBy: uid }
  const [rows, total] = await Promise.all([
    StudentProduct.find(filter)
      .populate('org', 'name')
      .populate('student', 'name')
      .populate('courseProduct', 'name')
      .select('student courseProduct totalLessons remainingLessons giftReason giftedAt expireDate isActive org')
      .sort({ giftedAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    StudentProduct.countDocuments(filter)
  ])
  return paged(
    rows.map((sp) => ({
      id: String(sp._id),
      student: sp.student ? { id: String(sp.student._id), name: sp.student.name } : null,
      courseProduct: sp.courseProduct ? sp.courseProduct.name : null,
      totalLessons: sp.totalLessons,
      remainingLessons: sp.remainingLessons,
      giftReason: sp.giftReason || '',
      giftedAt: sp.giftedAt || null,
      expireDate: sp.expireDate,
      isActive: sp.isActive !== false,
      org: sp.org ? { id: String(sp.org._id), name: sp.org.name } : null
    })),
    total,
    p
  )
}

/**
 * 退款经办。Order 本身没有 createdBy / 销售字段, 该用户与订单的唯一关联就是
 * refunds[].operator。这里按订单分页, 再把该用户经手的那几笔退款摊出来。
 */
async function listRefunds(uid, orgFilter, p) {
  const filter = { ...orgFilter, 'refunds.operator': uid }
  const [rows, total] = await Promise.all([
    Order.find(filter)
      .populate('org', 'name')
      .populate('student', 'name')
      .select('student status actualPrice refundedAmount refundedAt refunds org createdAt')
      .sort({ refundedAt: -1, createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Order.countDocuments(filter)
  ])
  return paged(
    rows.map((o) => ({
      id: String(o._id),
      // Order 没有 orderNo 字段, 前端用 _id 后 6 位当人读单号
      student: o.student ? { id: String(o.student._id), name: o.student.name } : null,
      status: o.status,
      actualPrice: o.actualPrice,
      refundedAmount: o.refundedAmount || 0,
      myRefunds: (o.refunds || [])
        .filter((r) => String(r.operator || '') === String(uid))
        .map((r) => ({ amount: r.amount, reason: r.reason, refundedAt: r.refundedAt })),
      org: o.org ? { id: String(o.org._id), name: o.org.name } : null
    })),
    total,
    p
  )
}

async function listFiles(uid, orgFilter, p) {
  // File.uploader —— 注意不是 uploadedBy (那是 StudentWork 的字段名)
  const filter = { ...orgFilter, uploader: uid, deletedAt: null }
  const [rows, total] = await Promise.all([
    File.find(filter)
      .populate('org', 'name')
      .select('originalName scope size mime isOrphan refCount org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    File.countDocuments(filter)
  ])
  return paged(
    rows.map((f) => ({
      id: String(f._id),
      originalName: f.originalName || '',
      scope: f.scope,
      size: f.size,
      // 字段名是 mime, 不是 mimeType
      mime: f.mime || '',
      refCount: f.refCount || 0,
      isOrphan: !!f.isOrphan,
      org: f.org ? { id: String(f.org._id), name: f.org.name } : null,
      createdAt: f.createdAt
    })),
    total,
    p
  )
}

async function listConsents(uid, _orgFilter, p) {
  // 协议签署是账号事实, 不按 org 裁剪 (org=null 表示平台级协议)
  const filter = { user: uid }
  const [rows, total] = await Promise.all([
    UserConsent.find(filter)
      .populate('org', 'name')
      .select('docKey docType version title subjectType withdrawAt org createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    UserConsent.countDocuments(filter)
  ])
  return paged(
    rows.map((c) => ({
      id: String(c._id),
      docKey: c.docKey,
      docType: c.docType,
      version: c.version,
      title: c.title || '',
      subjectType: c.subjectType || 'user',
      withdrawAt: c.withdrawAt || null,
      org: c.org ? { id: String(c.org._id), name: c.org.name } : null,
      createdAt: c.createdAt
    })),
    total,
    p
  )
}

async function listSessions(uid, _orgFilter, p) {
  // 注意: RefreshToken 有 TTL 索引, 过期行会被 Mongo 自动删除。
  //   所以这里是"当前会话", 不是登录历史 —— 别当审计用。
  const filter = { user: uid }
  const [rows, total] = await Promise.all([
    RefreshToken.find(filter)
      .select('userAgent ip isRevoked expiresAt familyId createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    RefreshToken.countDocuments(filter)
  ])
  const now = Date.now()
  return paged(
    rows.map((t) => ({
      id: String(t._id),
      userAgent: t.userAgent || '',
      ip: t.ip || '',
      familyId: t.familyId,
      isRevoked: !!t.isRevoked,
      isExpired: t.expiresAt ? new Date(t.expiresAt).getTime() < now : false,
      expiresAt: t.expiresAt,
      createdAt: t.createdAt
    })),
    total,
    p
  )
}

async function listAudit(uid, _orgFilter, p) {
  const filter = { 'actor._id': uid }
  const [rows, total] = await Promise.all([
    AuditLog.find(filter)
      .select('method path statusCode durationMs org ip requestId createdAt')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    AuditLog.countDocuments(filter)
  ])
  return paged(
    rows.map((a) => ({
      id: String(a._id),
      method: a.method,
      path: a.path,
      statusCode: a.statusCode,
      durationMs: a.durationMs,
      org: a.org && a.org._id ? { id: String(a.org._id), name: a.org.name } : null,
      ip: a.ip || '',
      requestId: a.requestId || '',
      createdAt: a.createdAt
    })),
    total,
    p
  )
}

/** 该用户在这条记录上担任了哪几个角色。map: { 字段名: 角色标签 } */
function pickRoles(uid, doc, map) {
  const out = []
  for (const [field, role] of Object.entries(map)) {
    if (String(doc[field] || '') === String(uid)) out.push(role)
  }
  return out
}

const HANDLERS = {
  students: listStudents,
  courseInstances: listCourseInstances,
  lessonSchedules: listLessonSchedules,
  evaluations: listEvaluations,
  works: listWorks,
  tasks: listTasks,
  parents: listParents,
  childLeads: listChildLeads,
  trialBookings: listTrialBookings,
  financeTx: listFinanceTx,
  giftedProducts: listGiftedProducts,
  refunds: listRefunds,
  files: listFiles,
  consents: listConsents,
  sessions: listSessions,
  audit: listAudit
}

async function related({ userId, orgId, isPlatformAdmin, domain, page, pageSize }) {
  if (!DOMAINS.has(domain)) throw ApiError.badRequest(`不支持的域: ${domain}`)
  if (PLATFORM_ONLY_DOMAINS.has(domain) && !isPlatformAdmin) {
    throw ApiError.forbidden('登录会话与操作审计仅平台超管可查看')
  }

  const { targetUser, orgFilter } = await resolveScope({ userId, orgId, isPlatformAdmin })
  const p = normalizePagination({ page, pageSize })
  return HANDLERS[domain](targetUser._id, orgFilter, p)
}

module.exports = { overview, related, resolveScope, DOMAINS, PLATFORM_ONLY_DOMAINS }
