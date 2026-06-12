'use strict'

const School = require('@models/School.model')
const Student = require('@models/Student.model')
const ApiError = require('@utils/ApiError')
const { normalizePagination } = require('@utils/pagination')
const removable = require('@utils/removable')

async function list({ orgId, keyword, type, isActive, page, pageSize }) {
  const p = normalizePagination({ page, pageSize })
  const filter = { org: orgId }
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  if (type) filter.type = type
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  const [items, total] = await Promise.all([
    School.find(filter).sort({ createdAt: -1 }).skip(p.skip).limit(p.limit).lean(),
    School.countDocuments(filter)
  ])
  return { items, total, page: p.page, pageSize: p.pageSize }
}

async function detail(id, orgId) {
  const s = await School.findOne({ _id: id, org: orgId }).lean()
  if (!s) throw ApiError.notFound('学校不存在')
  return s
}

async function create({ orgId, ...payload }) {
  const doc = await School.create({ ...payload, org: orgId })
  return doc.toObject()
}

async function update(id, orgId, payload) {
  const doc = await School.findOneAndUpdate(
    { _id: id, org: orgId },
    payload,
    { new: true, runValidators: true }
  )
  if (!doc) throw ApiError.notFound('学校不存在')
  return doc.toObject()
}

/**
 * 互锁检查声明（被 remove 与 removableCheck 共用）。
 * 学校的"物理删除"只挡"在册学生（isActive=true）仍在引用此学校"——
 * 已停用的学生（isActive=false）保留历史归属，不强挡。
 */
function schoolUsageChecks(orgId, schoolId) {
  return [
    {
      model: Student,
      filter: { org: orgId, school: schoolId, isActive: true },
      label: '在册学生',
      hint: '请先把这些在册学生切换到其他学校(或先停用)再删除学校'
    }
  ]
}

async function remove(id, orgId) {
  const doc = await School.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) throw ApiError.notFound('学校不存在')

  await removable.assertUnused(orgId, schoolUsageChecks(orgId, id))

  await School.deleteOne({ _id: id, org: orgId })
  return { success: true, id }
}

async function removableCheck(id, orgId) {
  const doc = await School.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'School', label: '学校', count: 0, hint: '该学校不存在或不属于本机构' }] }
  return removable.check(orgId, schoolUsageChecks(orgId, id))
}

module.exports = { list, detail, create, update, remove, removableCheck }
