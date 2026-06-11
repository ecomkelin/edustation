'use strict'

const Region = require('@models/Region.model')
const Org = require('@models/Org.model')
const ApiError = require('@utils/ApiError')

async function list({ level, parent, keyword, isActive }) {
  const filter = {}
  if (level !== undefined && level !== null && level !== '') filter.level = Number(level)
  if (parent === '0' || parent === '' || parent === null || parent === undefined) {
    // 不传或 0 视为不过滤
  } else if (parent === 'null') {
    filter.parent = null
  } else if (parent) {
    filter.parent = parent
  }
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }

  return Region.find(filter)
    .populate('parent', 'name level')
    .sort({ level: 1, sort: 1, createdAt: 1 })
    .lean()
}

async function tree() {
  const all = await Region.find().sort({ level: 1, sort: 1, createdAt: 1 }).lean()
  const idMap = new Map()
  all.forEach((n) => idMap.set(String(n._id), { ...n, id: String(n._id), children: [] }))
  const roots = []
  for (const n of all) {
    const pid = n.parent ? String(n.parent) : null
    if (pid && idMap.has(pid)) {
      idMap.get(pid).children.push(idMap.get(String(n._id)))
    } else {
      roots.push(idMap.get(String(n._id)))
    }
  }
  return roots
}

async function detail(id) {
  const r = await Region.findById(id).populate('parent', 'name level').lean()
  if (!r) throw ApiError.notFound('地区不存在')
  return r
}

async function create(payload) {
  if (payload.parent) {
    const parent = await Region.findById(payload.parent).select('level').lean()
    if (!parent) throw ApiError.badRequest('父级地区不存在')
    payload.level = parent.level + 1
  } else {
    payload.level = payload.level || 0
  }
  const doc = await Region.create(payload)
  return doc.toObject()
}

async function update(id, payload) {
  const doc = await Region.findById(id)
  if (!doc) throw ApiError.notFound('地区不存在')

  if (Object.prototype.hasOwnProperty.call(payload, 'parent')) {
    if (payload.parent) {
      const parent = await Region.findById(payload.parent).select('level').lean()
      if (!parent) throw ApiError.badRequest('父级地区不存在')
      if (String(parent._id) === String(doc._id)) throw ApiError.badRequest('不能将自身设为父级')
      payload.level = parent.level + 1
    } else {
      payload.level = 0
    }
  }
  Object.assign(doc, payload)
  await doc.save()
  return doc.toObject()
}

async function remove(id) {
  const r = await Region.findById(id)
  if (!r) throw ApiError.notFound('地区不存在')

  const childCount = await Region.countDocuments({ parent: id })
  if (childCount > 0) throw ApiError.badRequest('存在子级，请先删除子级')

  const usedByOrg = await Org.countDocuments({ region: id })
  if (usedByOrg > 0) throw ApiError.badRequest('该地区正在被机构引用，无法删除')

  await r.deleteOne()
  return { success: true }
}

module.exports = { list, tree, detail, create, update, remove }
