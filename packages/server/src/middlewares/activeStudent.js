'use strict'

const ApiError = require('@utils/ApiError')
const Student = require('@models/Student.model')

/**
 * 解析 x-active-student-id。
 * - 未传 header：不挂 req.activeStudentId，next()（部分接口不需要）
 * - 已传：必须存在于当前 org，且 req.user 是 guardians 之一
 */
module.exports = async function activeStudent(req, res, next) {
  try {
    const studentId = req.headers['x-active-student-id']
    if (!studentId) {
      return next()
    }

    if (!req.orgId) {
      throw ApiError.badRequest('缺少 x-org-id')
    }

    const student = await Student.findOne({
      _id: studentId,
      org: req.orgId,
      isActive: true
    })
      .select('_id name guardians')
      .lean()

    if (!student) throw ApiError.notFound('学生不存在')

    const isGuardian = (student.guardians || []).some((g) => String(g) === req.user.id)
    if (!isGuardian && !req.user.isPlatformAdmin) {
      throw ApiError.forbidden('当前孩子不在您的监护人列表中')
    }

    req.activeStudentId = String(student._id)
    next()
  } catch (e) {
    next(e)
  }
}
