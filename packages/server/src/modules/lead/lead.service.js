'use strict'

const Lead = require('@models/Lead.model')
const LeadActivity = require('@models/LeadActivity.model')
const TrialBooking = require('@models/TrialBooking.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const removable = require('@utils/removable')

/**
 * 招生试听 - 潜客 (Lead) 业务逻辑
 *
 * 关键设计:
 *   - 软唯一 phone: 同 org 下 phone 命中, 返回 { duplicate: true, lead }, 让前端引导
 *     "打开既有记录" 按钮; 不报 409, 避免销售重复录入
 *   - 创建 lead 时, 自动建首笔 TrialBooking (status=awaiting_schedule)
 *   - 状态机: pending → contacted → scheduled → tried → converted | lost
 *     - pending/contacted: 销售手动
 *     - scheduled: TrialBooking 排课时 (trialBooking.service.batchSchedule) 自动翻
 *     - tried: TrialBooking 完成时 (tryLesson.service.complete) 自动翻
 *     - converted: 转化时 (tryLesson.service.convert) 自动翻
 *     - lost: 销售手动 (PUT ?status=lost)
 *   - 触点日志: LeadActivity.create 时同步更新 Lead.lastContactedAt/By
 *   - 撤销转化 (unconvert): 5 分钟窗口, 物理删除新建的 Student/User/UserOrgRel
 *   - 物理删除 (remove): requirePlatformPassword, 互锁 TrialBooking + LeadActivity
 */

/**
 * 列出当前 org 下的 leads
 *
 * scope 兜底: 服务端强制 scope=mine 给无"看全部"权限的用户, 防止前端绕过
 * (无 admin 权限强制 mine) — 这是招生权限分级的关键防线。
 */
async function list({ orgId, currentUser, scope, status, keyword, phone, from, to, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }

  // 销售/教务分级: 仅管理员或教务可看全部, 销售默认 mine
  // 这里按"是否是平台超管"做粗粒度判定; 业务上更精细的"教务"判定由
  // 现有 requirePermission 走 UserOrgRel.positions, 在 router 层做。
  const canSeeAll = currentUser && currentUser.isPlatformAdmin
  const effectiveScope = canSeeAll ? (scope || 'all') : 'mine'
  if (effectiveScope === 'mine' && currentUser) {
    filter.createdBy = currentUser.id
  }

  if (status) {
    // 兼容逗号分隔多值
    const arr = String(status).split(',').map((s) => s.trim()).filter(Boolean)
    if (arr.length > 1) filter.status = { $in: arr }
    else if (arr.length === 1) filter.status = arr[0]
  }
  if (phone) filter.phone = phone
  if (keyword) {
    const kw = String(keyword).trim()
    if (kw) {
      filter.$or = [
        { name: { $regex: kw, $options: 'i' } },
        { remark: { $regex: kw, $options: 'i' } }
      ]
    }
  }
  if (from || to) {
    filter.createdAt = {}
    if (from) filter.createdAt.$gte = new Date(from)
    if (to) filter.createdAt.$lte = new Date(to)
  }

  const [items, total] = await Promise.all([
    Lead.find(filter)
      .populate('school', 'name')
      .populate('trialSubject', 'name')
      .populate('inviteTeacher', 'mobile realName')
      .populate('createdBy', 'mobile realName')
      .sort({ createdAt: -1 })
      .skip(p.skip)
      .limit(p.limit)
      .lean(),
    Lead.countDocuments(filter)
  ])

  // 批量带出"最近一笔 TrialBooking"摘要 (dashboard/列表展示用)
  if (items.length > 0) {
    const leadIds = items.map((l) => l._id)
    const recent = await TrialBooking.aggregate([
      { $match: { org: new (require('mongoose').Types.ObjectId)(String(orgId)), preStudent: { $in: leadIds } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: '$preStudent', doc: { $first: '$$ROOT' } } }
    ])
    const byLead = new Map(recent.map((r) => [String(r._id), r.doc]))
    for (const l of items) {
      const b = byLead.get(String(l._id))
      if (b) {
        l.latestBooking = {
          id: String(b._id),
          attemptNo: b.attemptNo,
          status: b.status,
          scheduledAt: b.scheduledAt,
          teacher: b.teacher
        }
      }
    }
  }

  // 派生: 同 phone 下"是第几个 / 共几个" (1 家长带多孩场景, 2026-06)
  // 不存物理字段 — phone 一旦补录/删除, 序号会变, 实时算最准
  if (items.length > 0) {
    const phones = [...new Set(items.map((l) => l.phone).filter(Boolean))]
    if (phones.length > 0) {
      const samePhone = await Lead.aggregate([
        { $match: { org: new (require('mongoose').Types.ObjectId)(String(orgId)), phone: { $in: phones } } },
        { $sort: { createdAt: 1 } },
        { $group: { _id: '$phone', leadIds: { $push: '$_id' } } }
      ])
      // phone -> [leadId...] (按 createdAt 升序, 1 家长带多孩下"第 1/2/3 个娃"自然排出来)
      const phoneMap = new Map(samePhone.map((r) => [r._id, r.leadIds.map(String)]))
      for (const l of items) {
        const arr = phoneMap.get(l.phone)
        if (arr && arr.length > 1) {
          const idx = arr.indexOf(String(l._id))
          if (idx >= 0) {
            l.samePhoneCount = arr.length
            l.samePhoneRank = idx + 1
          }
        }
      }
    }
  }

  return { items, total, page: p.page, pageSize: p.pageSize, scope: effectiveScope }
}

async function detail(id, orgId) {
  const lead = await Lead.findOne({ _id: id, org: orgId })
    .populate('school', 'name')
    .populate('trialSubject', 'name')
    .populate('inviteTeacher', 'mobile realName')
    .populate('createdBy', 'mobile realName')
    .populate('convertedStudent', 'name gender school')
    .populate('convertedUser', 'mobile realName')
    .lean()
  if (!lead) throw ApiError.notFound('潜客不存在')

  // 关联: 触点时间线 + 全部 TrialBooking (按 attemptNo 升序)
  const [activities, bookings] = await Promise.all([
    LeadActivity.find({ lead: lead._id, org: orgId })
      .populate('byUser', 'mobile realName')
      .sort({ at: -1 })
      .limit(50)
      .lean(),
    TrialBooking.find({ preStudent: lead._id, org: orgId })
      .populate('teacher', 'mobile realName')
      .populate('subject', 'name')
      .populate('lessonSchedule')
      .sort({ attemptNo: 1 })
      .lean()
  ])
  lead.activities = activities
  lead.bookings = bookings

  // 派生: 同 phone 下的位次 (1 家长带多孩场景, 2026-06)
  if (lead.phone) {
    const samePhoneLeads = await Lead.find({ org: orgId, phone: lead.phone })
      .select('_id createdAt')
      .sort({ createdAt: 1 })
      .lean()
    if (samePhoneLeads.length > 1) {
      const arr = samePhoneLeads.map((l) => String(l._id))
      const idx = arr.indexOf(String(lead._id))
      if (idx >= 0) {
        lead.samePhoneCount = samePhoneLeads.length
        lead.samePhoneRank = idx + 1
        // 兄弟 lead id 列表 (详情页"这家还有 N 个孩子"展示用)
        lead.samePhoneSiblingIds = arr.filter((id) => id !== String(lead._id))
      }
    }
  }

  return lead
}

/**
 * 创建潜客
 *
 * 流程:
 *   1. 软唯一: 同 org 下 phone 命中 → 返回 { duplicate: true, lead } (不报错)
 *      - 但 body.force=true 时跳过软唯一 (1 家长带多孩, 同 phone 合法, 用户显式确认)
 *   2. 未命中 (或被 force 跳过) → Lead.create
 *   3. 解析 trialSubjects 数组 (2026-06: 1 孩可试多门课):
 *      - 优先读 body.trialSubjects ([ObjectId])
 *      - 兼容老 payload body.trialSubject (单值) → 包成 [trialSubject]
 *      - 校验所有 id 合法且属于本 org
 *      - 数组去重, 长度 = 建几笔 TrialBooking
 *   4. 自动建 N 笔 TrialBooking (status=awaiting_schedule, attemptNo=1..N)
 */
async function create({ orgId, currentUser, body }) {
  if (!currentUser) throw ApiError.unauthorized()
  // 软唯一: phone 命中检查; force=true 时跳过 (用户显式确认"再加一个孩子")
  if (!body.force) {
    const existing = await Lead.findOne({ org: orgId, phone: body.phone }).lean()
    if (existing) {
      return { duplicate: true, lead: existing }
    }
  }
  // inviteTeacher 默认 = createdBy
  const inviteTeacher = body.inviteTeacher || currentUser.id

  // 解析试听科目数组 (2026-06 多选)
  // 优先 trialSubjects (数组); 兼容老 trialSubject (单值)
  const rawSubjects = Array.isArray(body.trialSubjects) && body.trialSubjects.length > 0
    ? body.trialSubjects
    : (body.trialSubject ? [body.trialSubject] : [])
  // 去重 + 过滤空值
  const subjectIds = [...new Set(rawSubjects.filter(Boolean).map((s) => String(s)))]
  // 校验 id 合法 + 属于本 org
  if (subjectIds.length > 0) {
    const Subject = require('@models/Subject.model')
    const validCount = await Subject.countDocuments({ _id: { $in: subjectIds }, org: orgId })
    if (validCount !== subjectIds.length) {
      throw ApiError.badRequest('试听科目包含不存在或不属于本机构的项')
    }
  }

  // 写入 lead: 主意向 = 第一个, 全集 = subjectIds
  const leadPayload = { ...body }
  delete leadPayload.trialSubjects // 不直接进 Lead.create, 我们显式控制
  delete leadPayload.trialSubject
  delete leadPayload.force         // 不落库
  const lead = await Lead.create({
    ...leadPayload,
    org: orgId,
    inviteTeacher,
    createdBy: currentUser.id,
    trialSubject: subjectIds[0] || null,    // 主意向快照
    trialSubjects: subjectIds,              // 意向全集
    status: 'pending'
  })

  // 按 subjectIds 长度自动建 N 笔 TrialBooking (attemptNo=1..N)
  // 若一个都没选, 也建 1 笔 (subject=null, 等后续排课时再补)
  const bookingCount = Math.max(subjectIds.length, 1)
  const bookings = []
  for (let i = 0; i < bookingCount; i++) {
    bookings.push({
      org: orgId,
      preStudent: lead._id,
      attemptNo: i + 1,
      joinMode: 'solo',
      status: 'awaiting_schedule',
      subject: subjectIds[i] || null,
      createdBy: currentUser.id
    })
  }
  await TrialBooking.insertMany(bookings)

  return { duplicate: false, lead: lead.toObject() }
}

/**
 * 更新潜客
 *
 * 约束:
 *   - createdBy 锁定 (即便前端传也忽略)
 *   - 状态字段: 仅允许主动改 'contacted' / 'lost' (其他由服务流驱动)
 *   - converted* 字段不通过此接口改 (只能由 tryLesson.service.convert 改)
 */
async function update(id, orgId, body) {
  // 屏蔽不可改字段
  const safe = { ...body }
  delete safe.createdBy
  delete safe.convertedStudent
  delete safe.convertedUser
  delete safe.convertedAt
  delete safe.convertedRemark
  delete safe.lastContactedAt
  delete safe.lastContactedBy
  // status 限制为白名单
  if (safe.status && !['contacted', 'lost'].includes(safe.status)) delete safe.status

  const lead = await Lead.findOneAndUpdate(
    { _id: id, org: orgId },
    { $set: safe },
    { new: true, runValidators: true }
  ).lean()
  if (!lead) throw ApiError.notFound('潜客不存在')
  return lead
}

/**
 * 物理删除 (高风险)
 *
 * 互锁: 任何 TrialBooking / LeadActivity 都阻挡 (除非平台超管密码确认)。
 * 业务上更推荐"标记流失"(status=lost) 而非物理删除。
 */
function leadUsageChecks(orgId, leadId) {
  return [
    {
      model: TrialBooking,
      filter: { org: orgId, preStudent: leadId },
      label: '试听记录', hint: '请先删除或转出该潜客的所有试听记录'
    },
    {
      model: LeadActivity,
      filter: { org: orgId, lead: leadId },
      label: '触点日志', hint: '触点日志将一并删除'
    }
  ]
}

async function remove({ id, orgId }) {
  const doc = await Lead.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('潜客不存在')
  await removable.assertUnused(orgId, leadUsageChecks(orgId, id))
  // 互锁通过 → 物理删除
  await LeadActivity.deleteMany({ lead: id, org: orgId })
  await Lead.deleteOne({ _id: id, org: orgId })
  return { id: String(id), deleted: true }
}

async function removableCheck({ id, orgId }) {
  return removable.check(orgId, leadUsageChecks(orgId, id))
}

/* ─── 触点日志 ─────────────────────────────────── */

async function listActivities(id, orgId) {
  // 校验 lead 存在并属于 org
  const leadExists = await Lead.exists({ _id: id, org: orgId })
  if (!leadExists) throw ApiError.notFound('潜客不存在')
  return LeadActivity.find({ lead: id, org: orgId })
    .populate('byUser', 'mobile realName')
    .sort({ at: -1 })
    .lean()
}

async function createActivity(id, orgId, currentUser, body) {
  if (!currentUser) throw ApiError.unauthorized()
  const lead = await Lead.findOne({ _id: id, org: orgId })
  if (!lead) throw ApiError.notFound('潜客不存在')
  const at = body.at ? new Date(body.at) : new Date()
  // 创建触点
  const activity = await LeadActivity.create({
    org: orgId,
    lead: id,
    type: body.type,
    byUser: currentUser.id,
    at,
    remark: body.remark || ''
  })
  // 同步更新 lead.lastContacted* 冗余
  lead.lastContactedAt = at
  lead.lastContactedBy = currentUser.id
  // 状态机: pending → contacted (仅当还是 pending 时翻, scheduled/tried/converted 不动)
  if (lead.status === 'pending') lead.status = 'contacted'
  await lead.save()
  return activity.toObject()
}

/* ─── 撤销转化 (5 分钟窗口) ─────────────────────── */

/**
 * 5 分钟内撤销试听转化:
 *   1. 设 Lead.status='tried' (回退)
 *   2. 物理删除新 Student (无下游引用)
 *   3. 物理删除新 User (requirePasswordChange=true 校验: 没有 StudentProduct/Attendance 引用)
 *   4. 物理删除 UserOrgRel (该 org + 家长 position)
 *   5. TrialBooking.result.isEnrolled=null
 */
const UNCONVERT_WINDOW_MS = 5 * 60 * 1000

async function unconvert({ id, orgId, currentUser }) {
  if (!currentUser) throw ApiError.unauthorized()
  const lead = await Lead.findOne({ _id: id, org: orgId })
  if (!lead) throw ApiError.notFound('潜客不存在')
  if (lead.status !== 'converted' || !lead.convertedAt) {
    throw ApiError.unprocessable('该潜客未转化或无法撤销')
  }
  const elapsed = Date.now() - new Date(lead.convertedAt).getTime()
  if (elapsed > UNCONVERT_WINDOW_MS) {
    throw ApiError.unprocessable('已超过 5 分钟撤销窗口, 业务上认账')
  }
  const Student = require('@models/Student.model')
  const User = require('@models/User.model')
  const UserOrgRel = require('@models/UserOrgRel.model')
  const StudentProduct = require('@models/StudentProduct.model')
  const LessonAttendance = require('@models/LessonAttendance.model')
  const Position = require('@models/Position.model')

  // 校验 User/Student 仍干净 (没有下游引用; 若有, 拒绝撤销)
  if (lead.convertedStudent) {
    const spCount = await StudentProduct.countDocuments({ student: lead.convertedStudent })
    const attCount = await LessonAttendance.countDocuments({ student: lead.convertedStudent })
    if (spCount || attCount) {
      throw ApiError.unprocessable('新学员已有课包/考勤记录, 无法撤销 (请联系超管)')
    }
  }
  if (lead.convertedUser) {
    // 校验 giftedBy / evaluatedBy 不指向该 user
    const giftedCount = await StudentProduct.countDocuments({ giftedBy: lead.convertedUser })
    if (giftedCount) {
      throw ApiError.unprocessable('该家长账号已有赠课记录, 无法撤销')
    }
  }

  // 1) 拿回 TrialBooking (用于 result 重置)
  const bookings = await TrialBooking.find({ preStudent: lead._id, org: orgId, 'result.isEnrolled': true })

  // 2) 物理删除
  if (lead.convertedStudent) {
    await Student.deleteOne({ _id: lead.convertedStudent })
  }
  if (lead.convertedUser) {
    await User.deleteOne({ _id: lead.convertedUser, requirePasswordChange: true })
  }
  // UserOrgRel: 查家长 position, 删对应的 rel
  const parentPos = await Position.findOne({ org: orgId, name: '家长' }).select('_id').lean()
  if (lead.convertedUser && parentPos) {
    await UserOrgRel.deleteOne({ user: lead.convertedUser, org: orgId, positions: [parentPos._id] })
  }
  // 3) TrialBooking result 重置
  for (const b of bookings) {
    b.result = {
      isEnrolled: null,
      negotiateTeacher: null,
      attractionPoint: '',
      reasonNotEnrolled: '',
      enrolledAt: null
    }
    await b.save()
  }

  // 4) Lead 状态回退
  lead.status = 'tried'
  lead.convertedStudent = null
  lead.convertedUser = null
  lead.convertedAt = null
  lead.convertedRemark = ''
  await lead.save()

  return { id: String(lead._id), rolledBack: true }
}

module.exports = {
  list, detail, create, update, remove, removableCheck,
  listActivities, createActivity,
  unconvert,
  leadUsageChecks
}
