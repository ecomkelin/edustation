'use strict'

const Room = require('@models/Room.model')
const ApiError = require('@utils/ApiError')

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

async function remove(id, orgId) {
  const doc = await Room.findOneAndUpdate({ _id: id, org: orgId }, { isActive: false }, { new: true })
  if (!doc) throw ApiError.notFound('教室不存在')
  return doc.toObject()
}

module.exports = { list, detail, create, update, remove }
