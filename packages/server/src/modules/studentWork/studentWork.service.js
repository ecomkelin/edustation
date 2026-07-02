'use strict'

const StudentWork = require('@models/StudentWork.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const CourseInstance = require('@models/CourseInstance.model')
const { File, REF_ENTITY } = require('@models/File.model')
const fileBind = require('@modules/storage/fileBind')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const mongoose = require('mongoose')

// ─── multer 已彻底移除 ────────────────────────────────────────────────────
// 阶段 2 改造：所有文件先经 POST /api/v1/storage/upload?scope=work (单) 或 /upload-many?scope=work (多) 落 driver + 写 File 文档，
// 拿到 fileIds 后再走本 service.create / service.update。fileUrls 字段保留是为了
// schema 向后兼容（旧 C 端 / 旧作品仍按 url 渲染），但实际写入的 url 都来自 File.url。

// 允许的 sort 字段（防 NoSQL injection：sort 走 mongoose .sort()，必须白名单）
const ALLOWED_SORTS = new Set([
  '-createdAt', 'createdAt',
  '-updatedAt', 'updatedAt',
  '-level', 'level',
  'title', '-title'
])

/**
 * 从 lessonAttendance 推导 4 个 snapshot 字段：
 *   attendance → schedule → courseInstance → subject
 *
 * 任一环不存在就抛错（避免出现"半成品"作品）。
 * subject 可能为 null（历史 CourseInstance 没设 subject），允许通过。
 */
async function resolveSnapshots(lessonAttendanceId, orgId) {
  const att = await LessonAttendance.findOne({ _id: lessonAttendanceId, org: orgId })
    .select('lessonSchedule student')
    .lean()
  if (!att) throw ApiError.notFound('考勤记录不存在')

  const sched = await LessonSchedule.findOne({ _id: att.lessonSchedule, org: orgId })
    .select('courseInstance')
    .lean()
  if (!sched) throw ApiError.unprocessable('考勤挂的排课已不存在')

  const ci = await CourseInstance.findOne({ _id: sched.courseInstance, org: orgId })
    .select('subject')
    .lean()
  if (!ci) throw ApiError.unprocessable('排课挂的开班已不存在')

  return {
    lessonAttendance: att._id,
    lessonSchedule: sched._id,
    courseInstance: ci._id,
    subject: ci.subject || null,
    student: att.student
  }
}

/**
 * 把 fileIds 解析成 url 数组（用于写 StudentWork.fileUrls 字段以保持 schema 兼容）。
 * 同时校验所有 file 都属于 orgId（防越权）。
 */
async function resolveFileUrls(orgId, fileIds) {
  const ids = fileIds.filter((x) => mongoose.isValidObjectId(x))
  if (ids.length === 0) throw ApiError.badRequest('fileIds 非法')
  const files = await File.find({ _id: { $in: ids }, deletedAt: null, org: orgId }).select('url')
  if (files.length !== ids.length) {
    throw ApiError.badRequest('部分 fileIds 不属于本机构或不存在')
  }
  return files.map((f) => f.url)
}

/**
 * 构建日期范围对象（service.list / service.stats 共用）。
 *   - 传 createdAtFrom + createdAtTo：用传入的（两端都转 Date）
 *   - 未传：默认 [本月1号 00:00, 当前时间]，长度为本期长度
 *
 * 返回 `{ from: Date, to: Date }`，无效或反序则抛 400。
 */
function resolveDateRange(createdAtFrom, createdAtTo) {
  let from
  let to
  if (createdAtFrom || createdAtTo) {
    if (createdAtFrom) {
      const d = new Date(createdAtFrom)
      if (isNaN(d.getTime())) throw ApiError.badRequest('createdAtFrom 必须是有效日期')
      from = d
    }
    if (createdAtTo) {
      const d = new Date(createdAtTo)
      if (isNaN(d.getTime())) throw ApiError.badRequest('createdAtTo 必须是有效日期')
      to = d
    }
  }
  if (!from && !to) {
    // 默认本月
    const now = new Date()
    from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    to = now
  }
  if (from && !to) to = new Date()
  if (!from && to) from = new Date(to.getFullYear(), to.getMonth(), 1, 0, 0, 0, 0)
  if (from > to) throw ApiError.badRequest('createdAtFrom 不能晚于 createdAtTo')
  return { from, to }
}

/**
 * 列表查询。支持的过滤维度：
 *   - lessonAttendance：直接按考勤查（最常用）
 *   - lessonSchedule：按排课查（删除守卫、走"本节课作品墙"）
 *   - courseInstance：按开班查（"这个班的所有作品"）
 *   - subject：按学科查（学科分析）
 *   - student：按学生查（家长端"我的作品"）
 *   - uploadedBy：按上传者过滤
 *   - createdAtFrom / createdAtTo：创建时间范围
 *   - minLevel / maxLevel：等级范围（闭区间）
 *   - sort：排序字段 (-createdAt/createdAt/-level/level/title/-title)
 *
 * 返回 `{ items, total, page, pageSize }`，与 studentProduct.service.list 一致。
 */
async function list({
  orgId,
  lessonAttendance,
  lessonSchedule,
  courseInstance,
  subject,
  student,
  uploadedBy,
  createdAtFrom,
  createdAtTo,
  minLevel,
  maxLevel,
  page,
  pageSize,
  sort
}) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (lessonAttendance) filter.lessonAttendance = lessonAttendance
  if (lessonSchedule) filter.lessonSchedule = lessonSchedule
  if (courseInstance) filter.courseInstance = courseInstance
  if (subject) filter.subject = subject
  if (student) filter.student = student
  if (uploadedBy) filter.uploadedBy = uploadedBy

  // 日期范围
  const hasDate = createdAtFrom || createdAtTo
  if (hasDate) {
    const { from, to } = resolveDateRange(createdAtFrom, createdAtTo)
    filter.createdAt = { $gte: from, $lte: to }
  }

  // 等级范围（闭区间）
  if (minLevel != null || maxLevel != null) {
    filter.level = {}
    if (minLevel != null) {
      const n = Number(minLevel)
      if (!Number.isInteger(n) || n < 1 || n > 5) throw ApiError.badRequest('minLevel 必须是 1~5 的整数')
      filter.level.$gte = n
    }
    if (maxLevel != null) {
      const n = Number(maxLevel)
      if (!Number.isInteger(n) || n < 1 || n > 5) throw ApiError.badRequest('maxLevel 必须是 1~5 的整数')
      filter.level.$lte = n
    }
  }

  // sort 字段白名单
  let sortObj = { createdAt: -1 }
  if (sort) {
    if (!ALLOWED_SORTS.has(String(sort))) {
      throw ApiError.badRequest(`sort 必须是以下之一: ${[...ALLOWED_SORTS].join(', ')}`)
    }
    sortObj = String(sort).startsWith('-')
      ? { [String(sort).slice(1)]: -1 }
      : { [String(sort)]: 1 }
  }

  const [items, total] = await Promise.all([
    StudentWork.find(filter)
      .populate('student', 'name')
      .populate('uploadedBy', 'realName mobile')
      .populate('lessonSchedule', 'plannedStartTime title lessonNo')
      .populate('courseInstance', 'name')
      .populate('subject', 'name')
      .sort(sortObj)
      .skip((p.page - 1) * p.limit)
      .limit(p.limit)
      .lean(),
    StudentWork.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.limit }
}

/**
 * 单条详情。
 * populate 全部 4 个 snapshot 字段 + student + uploadedBy。
 */
async function detail({ id, orgId }) {
  const doc = await StudentWork.findOne({ _id: id, org: orgId })
    .populate('student', 'name')
    .populate('uploadedBy', 'realName mobile')
    .populate('lessonAttendance', 'status')
    .populate('lessonSchedule', 'plannedStartTime title lessonNo')
    .populate('courseInstance', 'name courseProduct')
    .populate('subject', 'name')
    .lean()
  if (!doc) throw ApiError.notFound('作品不存在')
  return doc
}

/**
 * KPI 聚合 (R-1606)。
 *
 * 行为：
 *   1. 复用 list() 的过滤维度（lessonAttendance / lessonSchedule / courseInstance /
 *      subject / student / uploadedBy）+ 日期范围
 *   2. 计算本期 [from, to] + 上一期 [prevFrom, from) 同长度
 *   3. 用一次 `$match + $group` 聚合本期，再聚合上一期（并发执行）
 *
 * 返回：
 *   {
 *     total, ratedCount, unratedCount, avgLevel,
 *     prevTotal, prevRatedCount,
 *     periodFrom, periodTo    // ISO 字符串，前端不需再 date()
 *   }
 *
 * avgLevel 在 ratedCount=0 时返回 null（避免 0/0=NaN）。
 */
async function stats({
  orgId,
  lessonAttendance,
  lessonSchedule,
  courseInstance,
  subject,
  student,
  uploadedBy,
  createdAtFrom,
  createdAtTo
}) {
  const { from, to } = resolveDateRange(createdAtFrom, createdAtTo)
  const ms = to.getTime() - from.getTime()
  const prevTo = from
  const prevFrom = new Date(from.getTime() - ms)

  // 公共 $match 子句（不含日期）
  const baseMatch = { org: mongoose.Types.ObjectId(orgId) }
  if (lessonAttendance) baseMatch.lessonAttendance = mongoose.Types.ObjectId(lessonAttendance)
  if (lessonSchedule) baseMatch.lessonSchedule = mongoose.Types.ObjectId(lessonSchedule)
  if (courseInstance) baseMatch.courseInstance = mongoose.Types.ObjectId(courseInstance)
  if (subject) baseMatch.subject = mongoose.Types.ObjectId(subject)
  if (student) baseMatch.student = mongoose.Types.ObjectId(student)
  if (uploadedBy) baseMatch.uploadedBy = mongoose.Types.ObjectId(uploadedBy)

  // group by null 出汇总
  const groupPipeline = (gte, lte) => [
    { $match: { ...baseMatch, createdAt: { $gte: gte, $lte: lte } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        ratedCount: { $sum: { $cond: [{ $ne: ['$level', null] }, 1, 0] } },
        levelSum: { $sum: { $cond: [{ $ne: ['$level', null] }, '$level', 0] } }
      }
    }
  ]

  const [curr, prev] = await Promise.all([
    StudentWork.aggregate(groupPipeline(from, to)),
    StudentWork.aggregate(groupPipeline(prevFrom, prevTo))
  ])
  const c = curr[0] || { total: 0, ratedCount: 0, levelSum: 0 }
  const p = prev[0] || { total: 0, ratedCount: 0 }
  return {
    total: c.total,
    ratedCount: c.ratedCount,
    unratedCount: Math.max(0, c.total - c.ratedCount),
    avgLevel: c.ratedCount > 0 ? Number((c.levelSum / c.ratedCount).toFixed(2)) : null,
    prevTotal: p.total,
    prevRatedCount: p.ratedCount,
    periodFrom: from.toISOString(),
    periodTo: to.toISOString()
  }
}

/**
 * 导出 CSV (R-1640)。
 * 仿 AuditLogs.exportCsv：复用 list() 风格过滤，跳过分页 (limit=10000 上限)，
 * 返回 BOM 前的纯文本（BOM 由 controller 写）。
 *
 * 字段顺序（与 admin 列表对齐）：
 *   创建时间, 标题, 等级, 学生, 学科, 开班, 排课时间, 上传者, 描述
 */
async function exportCsv({
  orgId,
  lessonAttendance,
  lessonSchedule,
  courseInstance,
  subject,
  student,
  uploadedBy,
  createdAtFrom,
  createdAtTo,
  minLevel,
  maxLevel,
  sort
}) {
  const EXPORT_LIMIT = 10000
  const filter = { org: orgId }
  if (lessonAttendance) filter.lessonAttendance = lessonAttendance
  if (lessonSchedule) filter.lessonSchedule = lessonSchedule
  if (courseInstance) filter.courseInstance = courseInstance
  if (subject) filter.subject = subject
  if (student) filter.student = student
  if (uploadedBy) filter.uploadedBy = uploadedBy
  const hasDate = createdAtFrom || createdAtTo
  if (hasDate) {
    const { from, to } = resolveDateRange(createdAtFrom, createdAtTo)
    filter.createdAt = { $gte: from, $lte: to }
  }
  if (minLevel != null || maxLevel != null) {
    filter.level = {}
    if (minLevel != null) {
      const n = Number(minLevel)
      if (!Number.isInteger(n) || n < 1 || n > 5) throw ApiError.badRequest('minLevel 必须是 1~5 的整数')
      filter.level.$gte = n
    }
    if (maxLevel != null) {
      const n = Number(maxLevel)
      if (!Number.isInteger(n) || n < 1 || n > 5) throw ApiError.badRequest('maxLevel 必须是 1~5 的整数')
      filter.level.$lte = n
    }
  }
  let sortObj = { createdAt: -1 }
  if (sort && ALLOWED_SORTS.has(String(sort))) {
    sortObj = String(sort).startsWith('-')
      ? { [String(sort).slice(1)]: -1 }
      : { [String(sort)]: 1 }
  }

  const items = await StudentWork.find(filter)
    .populate('student', 'name')
    .populate('uploadedBy', 'realName mobile')
    .populate('lessonSchedule', 'plannedStartTime title')
    .populate('courseInstance', 'name')
    .populate('subject', 'name')
    .sort(sortObj)
    .limit(EXPORT_LIMIT)
    .lean()

  const headers = [
    '创建时间', '标题', '等级', '学生', '学科',
    '开班', '排课时间', '上传者', '描述'
  ]
  const lines = [headers.join(';')]
  for (const it of items) {
    lines.push([
      it.createdAt ? new Date(it.createdAt).toISOString() : '',
      it.title || '',
      it.level == null ? '' : it.level,
      (it.student && it.student.name) || '',
      (it.subject && it.subject.name) || '',
      (it.courseInstance && it.courseInstance.name) || '',
      it.lessonSchedule && it.lessonSchedule.plannedStartTime
        ? new Date(it.lessonSchedule.plannedStartTime).toISOString()
        : '',
      (it.uploadedBy && (it.uploadedBy.realName || it.uploadedBy.mobile)) || '',
      (it.description || '').replace(/[\r\n;]/g, ' ')
    ].map((v) => String(v).replace(/[\r\n;]/g, ' ')).join(';'))
  }
  return lines.join('\n')
}

/**
 * 创建作品。
 *
 * 入参：
 *   - orgId：当前机构（从 request context 注入）
 *   - operatorId：操作人（req.user.id）—— 写入 uploadedBy
 *   - lessonAttendance：考勤 ID（必填，**唯一锚点**）
 *   - title：作品标题（必填）
 *   - description：可选
 *   - fileIds：[String] File._id 列表（必填，≥1）
 *   - level：1~5，可选
 *
 * 行为：
 *   1. resolveFileIds(orgId, fileIds) 校验归属 + 拿到 url
 *   2. resolveSnapshots(lessonAttendance, orgId) 推导 4 个 snapshot 字段
 *   3. 写入 StudentWork（fileUrls 字段保留以兼容旧渲染；File 文档 refs 由 fileBind.bindUrls 维护）
 *   4. fileBind.bindUrls({urls, entity:'StudentWork', entityId, field:'fileUrls'}) 自动加 ref
 *   5. 返回详情
 */
async function create({ orgId, operatorId, lessonAttendance, title, description, fileIds, level }) {
  if (!lessonAttendance) throw ApiError.badRequest('lessonAttendance 必填')
  if (!title || !title.trim()) throw ApiError.badRequest('title 必填')
  if (!Array.isArray(fileIds) || fileIds.length === 0) throw ApiError.badRequest('至少 1 个 fileId')
  if (level !== undefined && level !== null) {
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      throw ApiError.badRequest('level 必须是 1~5 的整数')
    }
  }

  const fileUrls = await resolveFileUrls(orgId, fileIds)
  const snapshots = await resolveSnapshots(lessonAttendance, orgId)

  let doc
  try {
    doc = await StudentWork.create({
      org: orgId,
      ...snapshots,
      title: title.trim(),
      description: description || undefined,
      fileUrls,
      level: level ?? null,
      uploadedBy: operatorId
    })
  } catch (e) {
    if (e && e.code === 11000) {
      throw ApiError.conflict('同一考勤下已存在同名作品')
    }
    throw e
  }

  // 维护 File.refs：把这些 url 反向绑到本作品
  await fileBind.bindUrls({
    orgId,
    urls: fileUrls,
    entity: REF_ENTITY.STUDENT_WORK,
    entityId: doc._id,
    field: 'fileUrls'
  })

  return detail({ id: doc._id, orgId })
}

/**
 * 更新作品（员工操作）。
 *
 * 允许改的字段：
 *   - title、description、fileUrls、level
 *   - fileUrls?: 当传入时按"新 url 列表"整体替换；同时 fileBind.diffArray 维护 refs
 *
 * 不可改（强制从 payload 抹掉）：
 *   - 4 个 snapshot 字段（lessonAttendance/lessonSchedule/courseInstance/subject）
 *   - org / student / uploadedBy / createdAt / updatedAt
 */
async function update({ id, orgId, payload }) {
  const doc = await StudentWork.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('作品不存在')

  // 白名单 strip
  const ALLOWED = ['title', 'description', 'fileUrls', 'level']
  const next = {}
  for (const k of ALLOWED) {
    if (Object.prototype.hasOwnProperty.call(payload, k)) next[k] = payload[k]
  }

  if (next.title !== undefined) {
    if (!String(next.title).trim()) throw ApiError.badRequest('title 不能为空')
    next.title = String(next.title).trim()
  }
  if (next.level !== undefined && next.level !== null) {
    if (!Number.isInteger(next.level) || next.level < 1 || next.level > 5) {
      throw ApiError.badRequest('level 必须是 1~5 的整数')
    }
  }
  if (next.fileUrls !== undefined && next.fileUrls !== null) {
    if (!Array.isArray(next.fileUrls)) throw ApiError.badRequest('fileUrls 必须是数组')
    // 校验 url 都属于本 org
    const allFiles = await File.find({ url: { $in: next.fileUrls }, deletedAt: null, org: orgId }).select('url')
    const valid = new Set(allFiles.map((f) => f.url))
    next.fileUrls = next.fileUrls.filter((u) => valid.has(u))
  }

  if (Object.keys(next).length === 0) {
    throw ApiError.badRequest('没有可更新的字段')
  }

  const oldFileUrls = doc.fileUrls || []

  try {
    Object.assign(doc, next)
    await doc.save()
  } catch (e) {
    if (e && e.code === 11000) {
      throw ApiError.conflict('同一考勤下已存在同名作品')
    }
    throw e
  }

  // fileUrls 改了就 diff 一下
  if (next.fileUrls !== undefined) {
    await fileBind.diffArray({
      orgId,
      oldUrls: oldFileUrls,
      newUrls: doc.fileUrls,
      entity: REF_ENTITY.STUDENT_WORK,
      entityId: doc._id,
      field: 'fileUrls'
    })
  }

  return detail({ id: doc._id, orgId })
}

/**
 * 物理删除作品。作品是孤儿数据（无其他实体引用），但因为：
 *   1) 作品通常含图片/视频（隐私相关）
 *   2) 删除是"不可逆"
 * 仍走"超管+密码"二次确认（route 层 requirePlatformPassword 强制）。
 */
async function remove({ id, orgId }) {
  const doc = await StudentWork.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('作品不存在')
  // 解除 File 引用
  await fileBind.unbindEntity({
    orgId,
    urls: doc.fileUrls || [],
    entity: REF_ENTITY.STUDENT_WORK,
    entityId: doc._id
  })
  await doc.deleteOne()
  return { success: true }
}

/**
 * 预检:作品是孤儿数据,只要作品存在即可删。给前端"可删除"提示,UX 一致。
 */
async function removableCheck({ id, orgId }) {
  const doc = await StudentWork.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'StudentWork', label: '作品', count: 0, hint: '该作品不存在或不属于本机构' }] }
  return { canRemove: true, blockers: [] }
}

module.exports = { list, detail, stats, create, update, remove, removableCheck, exportCsv }
