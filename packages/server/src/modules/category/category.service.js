'use strict'

const Category = require('@models/Category.model')
const Org = require('@models/Org.model')
const ApiError = require('@utils/ApiError')

async function list({ model, level, parent, keyword, isActive }) {
  const filter = {}
  if (model) filter.model = model
  if (level !== undefined && level !== null && level !== '') filter.level = Number(level)
  if (parent === 'null' || parent === '' || parent === undefined) {
    // 不传 parent 视为不过滤
  } else if (parent === '0') {
    filter.parentCategory = null
  } else if (parent) {
    filter.parentCategory = parent
  }
  if (isActive === 'true' || isActive === true) filter.isActive = true
  if (isActive === 'false' || isActive === false) filter.isActive = false
  if (keyword) filter.name = { $regex: keyword, $options: 'i' }

  return Category.find(filter)
    .populate('parentCategory', 'name model level')
    .sort({ model: 1, level: 1, sort: 1, createdAt: 1 })
    .lean()
}

async function tree({ model }) {
  const filter = {}
  if (model) filter.model = model
  const all = await Category.find(filter)
    .sort({ model: 1, level: 1, sort: 1, createdAt: 1 })
    .lean()

  // 按 model 分组，然后每组按 parentCategory 嵌套
  const byModel = new Map()
  for (const c of all) {
    if (!byModel.has(c.model)) byModel.set(c.model, [])
    byModel.get(c.model).push({ ...c, id: String(c._id), children: [] })
  }

  const result = []
  for (const [, arr] of byModel) {
    const idMap = new Map(arr.map((n) => [String(n._id), n]))
    const roots = []
    for (const n of arr) {
      const pid = n.parentCategory ? String(n.parentCategory) : null
      if (pid && idMap.has(pid)) {
        idMap.get(pid).children.push(n)
      } else {
        roots.push(n)
      }
    }
    result.push(...roots)
  }
  return result
}

async function detail(id) {
  const c = await Category.findById(id).populate('parentCategory', 'name model level').lean()
  if (!c) throw ApiError.notFound('类别不存在')
  return c
}

async function create(payload) {
  // 校验 parent 合法（同 model）
  if (payload.parentCategory) {
    const parent = await Category.findById(payload.parentCategory).select('model level').lean()
    if (!parent) throw ApiError.badRequest('父级类别不存在')
    if (parent.model !== payload.model) throw ApiError.badRequest('父级类别 model 不一致')
    payload.level = parent.level + 1
  } else {
    payload.level = payload.level || 0
  }
  const doc = await Category.create(payload)
  return doc.toObject()
}

async function update(id, payload) {
  const doc = await Category.findById(id)
  if (!doc) throw ApiError.notFound('类别不存在')

  // 变更 parent 时重新计算 level
  if (Object.prototype.hasOwnProperty.call(payload, 'parentCategory')) {
    if (payload.parentCategory) {
      const parent = await Category.findById(payload.parentCategory).select('model level').lean()
      if (!parent) throw ApiError.badRequest('父级类别不存在')
      if (parent.model !== doc.model) throw ApiError.badRequest('父级类别 model 不一致')
      // 防成环
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

function categoryUsageChecks(categoryId) {
  return [
    {
      model: Category, filter: { parentCategory: categoryId },
      label: '子级类别', hint: '请先删除子级类别后再删'
    },
    {
      model: Org, filter: { type: categoryId },
      label: '机构引用', hint: '该类别正在被机构引用,请先调整机构类别后再删'
    }
  ]
}

async function remove(id) {
  const c = await Category.findById(id)
  if (!c) throw ApiError.notFound('类别不存在')

  // 互锁:用统一工具
  const { assertUnused } = require('@utils/removable')
  await assertUnused(null, categoryUsageChecks(id))

  await c.deleteOne()
  return { success: true }
}

async function removableCheck(id) {
  const c = await Category.findById(id).select('_id').lean()
  if (!c) return { canRemove: false, blockers: [{ entity: 'Category', label: '类别', count: 0, hint: '该类别不存在' }] }
  const { check } = require('@utils/removable')
  return check(null, categoryUsageChecks(id))
}

module.exports = { list, tree, detail, create, update, remove, removableCheck }
