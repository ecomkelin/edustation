'use strict'

const Room = require('@models/Room.model')
const CourseInstance = require('@models/CourseInstance.model')
const LessonSchedule = require('@models/LessonSchedule.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')

async function list({ orgId, keyword, isActive }) {
  const filter = { org: orgId }
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }
  return Room.find(filter).sort({ createdAt: -1 }).lean()
}

async function detail(id, orgId) {
  const r = await Room.findOne({ _id: id, org: orgId }).lean()
  if (!r) throw ApiError.notFound('教室不存在')
  return r
}

async function create({ orgId, ...payload }) {
  const doc = await Room.create({ ...payload, org: orgId })
  return doc.toObject()
}

async function update(id, orgId, payload) {
  const doc = await Room.findOneAndUpdate({ _id: id, org: orgId }, payload, { new: true, runValidators: true })
  if (!doc) throw ApiError.notFound('教室不存在')
  return doc.toObject()
}

/**
 * 互锁检查声明(被 remove 与 removableCheck 共用)。
 * 教室的"物理删除"只挡"未归档的开班/排课仍用此教室"——
 * 已归档的开班/排课仍持有 room id,但已不在排课视图展示,删除教室不会影响其历史。
 */
function roomUsageChecks(orgId, roomId) {
  return [
    {
      model: CourseInstance, filter: { org: orgId, room: roomId, deletedAt: null },
      label: '开班', hint: '请先把该教室从相关开班中移除(改派其他教室)后再删'
    },
    {
      model: LessonSchedule, filter: { org: orgId, room: roomId, status: { $ne: 'archived' } },
      label: '未归档排课', hint: '请先把该教室从相关排课中移除(改派其他教室)后再删'
    }
  ]
}

async function remove(id, orgId) {
  const doc = await Room.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) throw ApiError.notFound('教室不存在')

  await removable.assertUnused(orgId, roomUsageChecks(orgId, id))

  await Room.deleteOne({ _id: id, org: orgId })
  return { success: true, id }
}

async function removableCheck(id, orgId) {
  const doc = await Room.findOne({ _id: id, org: orgId }).select('_id').lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'Room', label: '教室', count: 0, hint: '该教室不存在或不属于本机构' }] }
  return removable.check(orgId, roomUsageChecks(orgId, id))
}

module.exports = { list, detail, create, update, remove, removableCheck }
