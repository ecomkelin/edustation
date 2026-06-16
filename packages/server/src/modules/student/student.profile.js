'use strict'

/**
 * 学生学习画像 (2026-06 新增)
 *
 * 业务: 挂在 Student 上, Student 本身有 org 字段天然按机构隔离.
 *   - 字段: 6 个结构化字段 + 元数据
 *   - 与 Student.notes (过敏史/特殊需求/老师注意事项) 完全独立; 不动 notes
 *
 * 边界:
 *   - 找不到学生 (id 不存在或 org 不匹配) → 404
 */

const Student = require('@models/Student.model')
const ApiError = require('@utils/ApiError')

const PROFILE_FIELDS = ['personality', 'learningGoal', 'weakness', 'classFeedback', 'strengths', 'followUp']

function shapeProfile(student) {
  if (!student) return null
  return {
    personality: student.personality || '',
    learningGoal: student.learningGoal || '',
    weakness: student.weakness || '',
    classFeedback: student.classFeedback || '',
    strengths: student.strengths || '',
    followUp: student.followUp || '',
    lastUpdatedBy: student.profileLastUpdatedBy
      ? { id: String(student.profileLastUpdatedBy._id || student.profileLastUpdatedBy.id), realName: student.profileLastUpdatedBy.realName }
      : null,
    lastUpdatedAt: student.profileLastUpdatedAt || null
  }
}

/**
 * 拿学生在当前机构下的画像. org 强制隔离, 跨机构访问直接 404.
 * @param {string} studentId
 * @param {string} orgId
 */
async function getProfile(studentId, orgId) {
  const student = await Student.findOne({ _id: studentId, org: orgId })
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  if (!student) throw ApiError.notFound('学生不存在')
  return shapeProfile(student)
}

/**
 * 写学生画像. org 强制隔离.
 * @param {string} studentId
 * @param {string} orgId
 * @param {Object} body
 * @param {{id: string}} currentUser
 */
async function setProfile(studentId, orgId, body, currentUser) {
  const student = await Student.findOne({ _id: studentId, org: orgId })
  if (!student) throw ApiError.notFound('学生不存在')
  // 白名单写入
  for (const f of PROFILE_FIELDS) {
    if (body[f] !== undefined) student[f] = body[f] || ''
  }
  student.profileLastUpdatedBy = currentUser.id
  student.profileLastUpdatedAt = new Date()
  await student.save()
  // 重新拉取 populate
  const fresh = await Student.findById(student._id)
    .populate('profileLastUpdatedBy', 'realName')
    .lean()
  return shapeProfile(fresh)
}

module.exports = { getProfile, setProfile, shapeProfile, PROFILE_FIELDS }
