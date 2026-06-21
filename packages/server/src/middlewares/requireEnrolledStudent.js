'use strict'

const ApiError = require('@utils/ApiError')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const { COURSE_ENROLLMENT_STATUSES } = require('@shared/enums')

/**
 * 校验当前 active student 至少有一条 status='enrolled' 的 CourseEnrollment。
 *
 * 业务上：宠物是报班后才送，没报班的学员不能领养/喂养宠物。
 * 与 activeStudent middleware 配合使用：activeStudent 先挂 req.activeStudentId，
 * 本中间件再校验学员已报班。
 *
 * 用法：
 *   router.use(mws.authenticate, mws.requireOrg, mws.activeStudent, mws.requireEnrolledStudent)
 *
 * 错误码：403 forbidden（与 activeStudent 的"不在监护人列表"区分 → 422 unprocessable）
 */
module.exports = async function requireEnrolledStudent(req, res, next) {
  try {
    const studentId = req.activeStudentId
    if (!studentId) {
      throw ApiError.badRequest('缺少 active student')
    }

    const enrolledCount = await CourseEnrollment.countDocuments({
      student: studentId,
      org: req.orgId,
      status: 'enrolled'
    })

    if (enrolledCount === 0) {
      throw ApiError.unprocessable('当前孩子未报班，无法领养宠物')
    }

    next()
  } catch (e) {
    next(e)
  }
}
