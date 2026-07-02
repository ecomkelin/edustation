'use strict'

const s = require('./lessonAttendance.service')
const ApiResponse = require('@utils/ApiResponse')

exports.list = async (req, res) => res.json(ApiResponse.ok(await s.list({ orgId: req.orgId, ...req.query })))

/**
 * R-1536 GET /lesson-attendances/me (2026-07-01 立项)
 * C 端家长：当前 active child 的考勤记录，主要用于「作品上传」/「作品墙」选考勤场景。
 * 复用 service.list，强制 student=req.activeStudentId，避免越权读到别的孩子的考勤。
 * 默认 status 过滤：可上传作品的考勤 = scheduled / completed / madeup / leave
 *   (no_show / arrived 因学员未上课, 家长代交作品意义不大, 仍可通过 ?status=... 显式覆盖)
 * 默认按创建时间倒序，最近的课排在前。
 */
exports.mine = async (req, res) => {
  // 默认 status 过滤：可上传作品的考勤集合
  const allowedDefault = ['scheduled', 'completed', 'madeup', 'leave']
  // 复制 query, 移除 student (强制覆盖) + 整理 status
  const q = { ...req.query }
  delete q.student
  if (!q.status) {
    q.status = allowedDefault.join(',')
  }
  res.json(ApiResponse.ok(await s.list({
    orgId: req.orgId,
    student: req.activeStudentId,
    ...q
  })))
}

/**
 * 签到：按 (lessonSchedule, student) 定位已有考勤并置为 checked_in。
 * 注意：考勤记录在 LessonSchedule 状态切到「准备上课 (preparing)」时按 CourseEnrollment 自动生成，
 * 这里只用 lessonSchedule + student 定位到一条考勤并置为 checked_in。
 * 如果该学生还没有考勤（极个别场景：教务在 preparing 之后才补报名 / 教务手动添加），
 * 可先调 POST /lesson-attendances (addManual) 创建一条，再签到。
 */
exports.checkIn = async (req, res) => {
  const { lessonSchedule, student, ...rest } = req.body
  if (!lessonSchedule || !student) {
    return res.status(400).json(ApiResponse.fail(400, 'lessonSchedule / student 必填'))
  }
  // 把 (lessonSchedule, student) 转成 attendance id
  const LessonAttendance = require('@models/LessonAttendance.model')
  const att = await LessonAttendance.findOne({ org: req.orgId, lessonSchedule, student }).select('_id').lean()
  if (!att) return res.status(404).json(ApiResponse.fail(404, '该学生在本排课尚无考勤记录，请先在「考勤」入口添加'))
  res.status(200).json(ApiResponse.ok(await s.checkIn({ orgId: req.orgId, id: att._id, ...rest })))
}

/**
 * 教务手动添加单条 LessonAttendance（用于 preparing 之后补报名/补名单）。
 * Body: { lessonSchedule, student, studentProduct?, remark? }
 */
exports.addManual = async (req, res) => res.json(ApiResponse.ok(await s.addManual({ orgId: req.orgId, ...req.body })))

exports.complete = async (req, res) => res.json(ApiResponse.ok(await s.complete({ id: req.params.id, orgId: req.orgId, ...req.body })))
exports.noShow = async (req, res) => res.json(ApiResponse.ok(await s.markStatus({ id: req.params.id, orgId: req.orgId, toStatus: 'no_show', ...req.body })))
/**
 * 「开课」批量登记：一次保存一节课所有学生的考勤状态
 * Body: { lessonSchedule, items: [{ attendance, status, remark? }] }
 */
exports.bulkMark = async (req, res) => res.json(ApiResponse.ok(await s.bulkMarkForLesson({ orgId: req.orgId, ...req.body })))
exports.works = async (req, res) => res.json(ApiResponse.ok(await s.works({ id: req.params.id, orgId: req.orgId })))
/**
 * 写入/更新结构化课评（仅 status=completed 可写）。
 * Body: { score?, content?, strengths?, improvements? }，每个字段可选；evaluatedBy=req.user.id，evaluatedAt=now
 */
exports.updateEvaluation = async (req, res) => res.json(
  ApiResponse.ok(await s.updateEvaluation({
    id: req.params.id, orgId: req.orgId, actorId: req.user.id, patch: req.body
  }))
)

/**
 * 「补课」：为已结束/已归档排课的某条未消课考勤补建一条 completed记录。
 *路径：POST /lesson-attendances/:id/makeup
 */
exports.makeup = async (req, res) => res.json(
 ApiResponse.ok(await s.makeup({ id: req.params.id, orgId: req.orgId, ...req.body }))
)
