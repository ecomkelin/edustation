'use strict'

const fs = require('fs')
const path = require('path')
const multer = require('multer')
const StudentWork = require('@models/StudentWork.model')
const LessonAttendance = require('@models/LessonAttendance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const CourseInstance = require('@models/CourseInstance.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const config = require('@config/index')

// ─── 文件落盘（multer） ─────────────────────────────────────────────────────
// 与原 lessonWork 保持一致；后续阶段切到 MinIO 时只改这里。
if (!fs.existsSync(config.upload.dir)) {
  fs.mkdirSync(config.upload.dir, { recursive: true })
}
const storage = multer.diskStorage({
  destination(req, file, cb) {
    const sub = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const dir = path.join(config.upload.dir, sub)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    cb(null, dir)
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/[^\w-]/g, '_')
    cb(null, `${Date.now()}_${base}${ext}`)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: config.upload.maxFileSize }
})

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
 * 列表查询。支持的过滤维度：
 *   - lessonAttendance：直接按考勤查（最常用）
 *   - lessonSchedule：按排课查（删除守卫、走"本节课作品墙"）
 *   - courseInstance：按开班查（"这个班的所有作品"）
 *   - subject：按学科查（学科分析）
 *   - student：按学生查（家长端"我的作品"）
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
  page,
  pageSize
}) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (lessonAttendance) filter.lessonAttendance = lessonAttendance
  if (lessonSchedule) filter.lessonSchedule = lessonSchedule
  if (courseInstance) filter.courseInstance = courseInstance
  if (subject) filter.subject = subject
  if (student) filter.student = student

  const [items, total] = await Promise.all([
    StudentWork.find(filter)
      .populate('student', 'name')
      .populate('uploadedBy', 'realName mobile')
      .populate('lessonSchedule', 'plannedStartTime title lessonNo')
      .populate('courseInstance', 'name')
      .populate('subject', 'name')
      .sort({ createdAt: -1 })
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
 * 创建作品。
 *
 * 入参：
 *   - orgId：当前机构（从 request context 注入）
 *   - operatorId：操作人（req.user.id）—— 写入 uploadedBy
 *   - lessonAttendance：考勤 ID（必填，**唯一锚点**）
 *   - title：作品标题（必填）
 *   - description：可选
 *   - fileUrls：已上传文件 URL 数组（必填，≥1）
 *
 * 行为：
 *   1. resolveSnapshots(lessonAttendance, orgId) 推导 4 个 snapshot 字段
 *   2. 写入 StudentWork（snapshot 字段由 Mongoose 写入后即 immutable）
 *   3. 返回详情（含 populate）
 *
 * 错误：
 *   - 考勤/排课/开班不存在 → 404/422
 *   - (lessonAttendance, title) 重复 → Mongoose 唯一索引冲突（E11000）→ 409
 */
async function create({ orgId, operatorId, lessonAttendance, title, description, fileUrls, level }) {
  if (!lessonAttendance) throw ApiError.badRequest('lessonAttendance 必填')
  if (!title || !title.trim()) throw ApiError.badRequest('title 必填')
  if (!fileUrls || fileUrls.length === 0) throw ApiError.badRequest('至少上传一个文件')
  if (level !== undefined && level !== null) {
    if (!Number.isInteger(level) || level < 1 || level > 5) {
      throw ApiError.badRequest('level 必须是 1~5 的整数')
    }
  }

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
    // (lessonAttendance, title) 唯一索引冲突
    if (e && e.code === 11000) {
      throw ApiError.conflict('同一考勤下已存在同名作品')
    }
    throw e
  }
  return detail({ id: doc._id, orgId })
}

/**
 * 更新作品（员工操作）。
 *
 * 允许改的字段：
 *   - title、description、fileUrls、level
 *
 * 不可改（强制从 payload 抹掉）：
 *   - 4 个 snapshot 字段（lessonAttendance/lessonSchedule/courseInstance/subject）
 *   - org / student / uploadedBy / createdAt / updatedAt
 *
 * 注意：service 层不强制校验"业务上改 title 是否合理"——title 唯一索引
 *   (lessonAttendance, title) 仍会兜底，重复直接 409。
 */
async function update({ id, orgId, payload }) {
  const doc = await StudentWork.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('作品不存在')

  // 白名单 strip：只允许以下字段透传
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
  // 显式允许把 level 置为 null（"清空评定"）
  if (next.level === null) {
    // OK
  }

  if (Object.keys(next).length === 0) {
    throw ApiError.badRequest('没有可更新的字段')
  }

  try {
    Object.assign(doc, next)
    await doc.save()
  } catch (e) {
    if (e && e.code === 11000) {
      throw ApiError.conflict('同一考勤下已存在同名作品')
    }
    throw e
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
  await doc.deleteOne()
  // 可选：清理本地文件（阶段 2 接 MinIO 后再补）
  return { success: true }
}

module.exports = { upload, list, detail, create, update, remove }
