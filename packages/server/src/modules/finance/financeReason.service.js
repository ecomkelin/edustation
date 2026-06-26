'use strict'

/**
 * 财务原因 service (2026-06-25 立项)
 *
 * 薄包装 Category 字典 (model='FinanceReason', per-org)
 * - listReasons / createReason / updateReason / removeReason
 * - 物理删除: assertUnused (FinanceTransaction 引用) + requirePlatformPassword (路由层)
 */

const Category = require('@models/Category.model')
const FinanceTransaction = require('@models/FinanceTransaction.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')

/**
 * 列出本机构 active 的财务原因 (可按 direction 过滤)
 */
async function listReasons(orgId, opts = {}) {
  const filter = { org: orgId, model: 'FinanceReason' }
  if (opts.isActive === 'true' || opts.isActive === true) filter.isActive = true
  if (opts.isActive === 'false' || opts.isActive === false) filter.isActive = false
  if (opts.direction) filter['meta.direction'] = opts.direction
  return Category.find(filter).sort({ sort: 1, createdAt: 1 }).lean()
}

async function createReason(orgId, payload) {
  if (!payload.name || !payload.name.trim()) throw ApiError.badRequest('名称必填')
  const direction = payload.direction || (payload.meta && payload.meta.direction)
  if (!direction || !['in', 'out'].includes(direction)) {
    throw ApiError.badRequest('direction 必填 (in 收入 / out 支出)')
  }
  const data = {
    org: orgId,
    model: 'FinanceReason',
    name: String(payload.name).trim(),
    level: 0,
    parentCategory: null,
    sort: Number(payload.sort) || 0,
    isActive: payload.isActive !== false,
    code: payload.code || null,
    meta: {
      direction,
      category: (payload.meta && payload.meta.category) || payload.category || null
    }
  }
  const reason = await Category.create(data)
  return reason.toObject()
}

async function updateReason(orgId, id, patch) {
  const existing = await Category.findOne({ _id: id, org: orgId, model: 'FinanceReason' }).lean()
  if (!existing) throw ApiError.notFound('原因不存在')

  const update = {}
  if (patch.name !== undefined) {
    if (!String(patch.name).trim()) throw ApiError.badRequest('名称不能为空')
    update.name = String(patch.name).trim()
  }
  if (patch.isActive !== undefined) update.isActive = !!patch.isActive
  if (patch.sort !== undefined) update.sort = Number(patch.sort)
  if (patch.code !== undefined) update.code = patch.code || null

  // direction / meta 强校验
  if (patch.direction !== undefined || (patch.meta && patch.meta.direction !== undefined)) {
    const newDir = patch.direction || patch.meta.direction
    if (!['in', 'out'].includes(newDir)) {
      throw ApiError.badRequest('direction 必须是 in / out')
    }
    update['meta.direction'] = newDir
  }
  if (patch.category !== undefined || (patch.meta && patch.meta.category !== undefined)) {
    const newCat = patch.category || patch.meta.category
    update['meta.category'] = newCat || null
  }

  if (Object.keys(update).length === 0) {
    throw ApiError.badRequest('没有可更新字段')
  }

  const doc = await Category.findOneAndUpdate(
    { _id: id, org: orgId, model: 'FinanceReason' },
    { $set: update },
    { new: true, runValidators: true }
  )
  return doc.toObject()
}

/**
 * 互锁检查声明
 *   "FinanceReason → FinanceTransaction": 任意一笔流水引用该原因即挡
 */
function reasonsUsageChecks(orgId, reasonId) {
  return [
    {
      model: FinanceTransaction,
      filter: { org: orgId, reason: reasonId },
      label: '关联的财务流水',
      hint: '请先将引用该原因的流水改为其他原因后再删'
    }
  ]
}

async function removeReason(orgId, id) {
  const reason = await Category.findOne({ _id: id, org: orgId, model: 'FinanceReason' })
    .select('_id')
    .lean()
  if (!reason) throw ApiError.notFound('原因不存在')
  await removable.assertUnused(orgId, reasonsUsageChecks(orgId, id))
  await Category.deleteOne({ _id: id, org: orgId, model: 'FinanceReason' })
  return { success: true, id }
}

async function removableCheck(orgId, id) {
  const reason = await Category.findOne({ _id: id, org: orgId, model: 'FinanceReason' })
    .select('_id')
    .lean()
  if (!reason) {
    return {
      canRemove: false,
      blockers: [{ entity: 'FinanceReason', label: '原因', count: 0, hint: '该原因不存在或不属于本机构' }]
    }
  }
  return removable.check(orgId, reasonsUsageChecks(orgId, id))
}

module.exports = {
  listReasons,
  createReason,
  updateReason,
  removeReason,
  removableCheck
}
