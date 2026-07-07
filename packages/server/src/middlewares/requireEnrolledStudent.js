'use strict'

const ApiError = require('@utils/ApiError')
const CourseEnrollment = require('@models/CourseEnrollment.model')
const PetAccount = require('@models/PetAccount.model')

/**
 * 校验当前 active student 是否有报班, 或者已经有宠物 (admin 已代领养或历史数据).
 *
 * 业务上：宠物是报班后才送，没报班的学员不能领养/喂养宠物。
 * 但 admin 端已经代领养的 pet (PetAccount 文档已存在) 应该可以正常操作 — 否则就成了
 *   "数据可见不可写" (张小明 admin 端代领养 → C 端能看到 pet → 点破壳/喂食 422).
 *
 * 规则:
 *   - 有 PetAccount 文档 → 放行 (admin 代领养场景)
 *   - 没 PetAccount 但有 enrollment → 放行 (正常自助流程)
 *   - 都没 → 422 "当前孩子未报班,无法领养宠物" (只对"完全没 pet + 没报班"的新学员阻断)
 *
 * 与 activeStudent middleware 配合使用：activeStudent 先挂 req.activeStudentId,
 * 本中间件再校验.
 *
 * 用法：
 *   router.use(mws.authenticate, mws.requireOrg, mws.activeStudent, mws.requireEnrolledStudent)
 */
module.exports = async function requireEnrolledStudent(req, res, next) {
  try {
    const studentId = req.activeStudentId
    if (!studentId) {
      throw ApiError.badRequest('缺少 active student')
    }

    // 2026-07-07: 有 pet 文档就放行 (admin 代领养场景)
    const hasPet = await PetAccount.exists({ org: req.orgId, student: studentId })
    if (hasPet) return next()

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
