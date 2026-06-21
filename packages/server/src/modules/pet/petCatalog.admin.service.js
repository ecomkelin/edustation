'use strict'

/**
 * Pet Catalog Admin Service（2026-06-21 pet-system-v2-ext）
 *
 * 三个 catalog 的 CRUD 通用接口：
 *   - list / create / detail / update / remove / removableCheck
 *
 * 复用：
 *   - reportCache.withCache + invalidate（catalog 读 cache，写 invalidate）
 *   - fileBind.diffSingleById（imageFile 字段变更时维护 File.refs）
 *   - removable.assertUnused / check（删前互锁）
 *   - requirePlatformPassword middleware（高风险删除）
 *
 * 权限：
 *   - list / detail / listEvents → pet.read
 *   - create / update / remove → pet.write
 *
 * 关键设计：
 *   - org=null 平台默认记录：仅平台超管可写（requirePlatformAdmin 兜底）；机构 admin 看不到
 *   - per-org 覆盖：同 key + 同 org 时与平台默认合并时优先
 *   - delete 互锁：species 被 PetAccount.species 引用 → 阻止；item 被 PetAccount.unlocked 引用 → 阻止
 *     （equipped 是临时状态，不查；删 item 时 equipped=null 即可）
 *   - SVG sanitize：写入时剥 <script> + on* 事件属性（XSS 防护）
 */

const mongoose = require('mongoose')
const PetSpecies = require('@models/PetSpecies.model')
const PetItem = require('@models/PetItem.model')
const PetConsumable = require('@models/PetConsumable.model')
const PetAccount = require('@models/PetAccount.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const fileBind = require('@modules/storage/fileBind')
const { withCache, invalidate: invalidateCache } = require('@modules/report/reportCache')
const { REF_ENTITY } = require('@models/File.model')

const { ObjectId } = mongoose.Types

/* ─── SVG XSS sanitize ─────────────────────────────────── */
/**
 * 简单 SVG sanitize：剥 <script> 标签 + on* 事件属性。
 * 不做穷举，仅防最常见 XSS 入口。
 */
function sanitizeSvg(input) {
  if (typeof input !== 'string') return null
  // 剥 <script>...</script>
  let s = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  // 剥 on* 属性（onclick / onload / onerror 等）
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
  return s.trim() || null
}

/* ─── 通用 list 工具：per-org + org=null 平台默认合并 ─── */
/**
 * 通用 list 工具。读取该 org 下所有记录 + org=null 平台默认（key 不被 org 覆盖的）。
 * 缓存 key: petCatalog:${type}:${orgId}:${filterHash}
 */
async function listMerged({ orgId, Model, type, baseFilter = {}, keyword, extraFilter = {} }) {
  const filterKey = JSON.stringify({ baseFilter, keyword, extraFilter })
  return withCache(`petCatalog:${type}:${orgId}:${filterKey}`, async () => {
    // org 自己的 key 集合
    const ownKeys = await Model.distinct('key', { org: orgId, ...baseFilter, ...extraFilter })
    // $or: org=orgId OR (org=null AND key not in ownKeys)
    const filter = {
      $and: [
        { ...baseFilter, ...extraFilter },
        { $or: [{ org: orgId }, { org: null, key: { $nin: ownKeys } }] }
      ]
    }
    if (keyword && String(keyword).trim()) {
      filter.$and.push({ name: { $regex: String(keyword).trim(), $options: 'i' } })
    }
    return Model.find(filter)
      .populate('imageFile', 'url mime originalName')
      .sort({ tier: 1, slot: 1, key: 1 })
      .lean()
  }, 300_000) // 5min TTL
}

/* ─── Species CRUD ─────────────────────────────────── */

async function listSpecies({ orgId, tier, isActive, keyword }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const baseFilter = {}
  if (tier) baseFilter.tier = tier
  if (isActive !== undefined) baseFilter.isActive = isActive
  const items = await listMerged({ orgId, Model: PetSpecies, type: 'species', baseFilter, keyword })
  // 补 speciesRecord 不需要（已是完整文档）
  return items
}

async function getSpecies({ orgId, id }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const doc = await PetSpecies.findOne({ _id: id }).populate('imageFile', 'url mime originalName').lean()
  if (!doc) throw ApiError.notFound('物种不存在')
  // 校验 org 范围：org=orgId 或 org=null 平台默认
  if (doc.org && String(doc.org) !== String(orgId)) {
    throw ApiError.notFound('物种不存在')
  }
  return doc
}

async function createSpecies({ orgId, payload, operatorId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!payload.key || !payload.name || !payload.tier || !payload.visualType) {
    throw ApiError.badRequest('key/name/tier/visualType 必填')
  }
  // 校验同 org 下 key 不重
  const exists = await PetSpecies.findOne({ org: orgId, key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`物种 key=${payload.key} 已存在`)

  const doc = {
    org: orgId,
    key: payload.key.trim(),
    name: payload.name.trim(),
    tier: payload.tier,
    visualType: payload.visualType,
    imageFile: payload.visualType === 'image' ? (payload.imageFile || null) : null,
    svgContent: payload.visualType === 'svg' ? sanitizeSvg(payload.svgContent) : null,
    weight: Number(payload.weight) || 100,
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetSpecies.create(doc)
  invalidateCache(orgId)
  // fileBind：imageFile
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId, oldId: null, newId: doc.imageFile,
      entity: REF_ENTITY.PET_SPECIES, entityId: created._id, field: 'imageFile'
    })
  }
  return created.toObject()
}

async function updateSpecies({ orgId, id, payload, operatorId }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetSpecies.findOne({ _id: id, $or: [{ org: orgId }, { org: null }] })
  if (!doc) throw ApiError.notFound('物种不存在')
  if (!doc.org || String(doc.org) !== String(orgId)) {
    // org=null 平台默认 → 仅当前 org 写自己 per-org；不允许改平台默认（除非 super-admin 走专门路径，本 MVP 不做）
    throw ApiError.forbidden('平台默认物种不可改，请用同名 per-org 记录覆盖')
  }

  const updates = {}
  if (payload.name !== undefined) updates.name = String(payload.name).trim()
  if (payload.tier !== undefined) updates.tier = payload.tier
  if (payload.visualType !== undefined) updates.visualType = payload.visualType
  if (payload.weight !== undefined) updates.weight = Number(payload.weight) || 0
  if (payload.isActive !== undefined) updates.isActive = !!payload.isActive
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.imageFile !== undefined && doc.visualType === 'image') {
    updates.imageFile = payload.imageFile || null
  }
  if (payload.svgContent !== undefined && doc.visualType === 'svg') {
    updates.svgContent = sanitizeSvg(payload.svgContent)
  }
  updates.updatedBy = operatorId

  const oldImageFile = doc.imageFile ? doc.imageFile.toString() : null
  const updated = await PetSpecies.findByIdAndUpdate(doc._id, { $set: updates }, { new: true })
  invalidateCache(orgId)

  if (doc.visualType === 'image' && payload.imageFile !== undefined) {
    await fileBind.diffSingleById({
      orgId, oldId: oldImageFile, newId: updated.imageFile ? updated.imageFile.toString() : null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'imageFile'
    })
  }
  return updated.toObject()
}

function speciesUsageChecks(orgId, key) {
  return [
    {
      model: PetAccount,
      filter: { org: orgId, species: key },
      label: '宠物实例引用',
      hint: '请先将引用此物种的宠物迁移/置换后再删'
    }
  ]
}

async function removableCheckSpecies({ orgId, id }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetSpecies.findOne({ _id: id }).lean()
  if (!doc) {
    return { canRemove: false, blockers: [{ entity: 'PetSpecies', label: '物种', count: 0, hint: '物种不存在' }] }
  }
  if (!doc.org || String(doc.org) !== String(orgId)) {
    return { canRemove: false, blockers: [{ entity: 'PetSpecies', label: '物种', count: 0, hint: '物种不存在或不属于本机构' }] }
  }
  return removable.check(orgId, speciesUsageChecks(orgId, doc.key))
}

async function removeSpecies({ orgId, id }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetSpecies.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('物种不存在')
  await removable.assertUnused(orgId, speciesUsageChecks(orgId, doc.key))
  // 物理删除
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId, oldId: doc.imageFile.toString(), newId: null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'imageFile'
    })
  }
  await doc.deleteOne()
  invalidateCache(orgId)
  return { deleted: true }
}

/* ─── Item CRUD ─────────────────────────────────── */

async function listItems({ orgId, slot, isActive, keyword }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const baseFilter = {}
  if (slot) baseFilter.slot = slot
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ orgId, Model: PetItem, type: 'items', baseFilter, keyword })
}

async function getItem({ orgId, id }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const doc = await PetItem.findOne({ _id: id }).populate('imageFile', 'url mime originalName').lean()
  if (!doc) throw ApiError.notFound('装饰不存在')
  if (doc.org && String(doc.org) !== String(orgId)) throw ApiError.notFound('装饰不存在')
  return doc
}

async function createItem({ orgId, payload, operatorId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!payload.key || !payload.name || !payload.slot || !payload.unlockType) {
    throw ApiError.badRequest('key/name/slot/unlockType 必填')
  }
  const exists = await PetItem.findOne({ org: orgId, key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`装饰 key=${payload.key} 已存在`)

  const doc = {
    org: orgId,
    key: payload.key.trim(),
    name: payload.name.trim(),
    slot: payload.slot,
    unlockType: payload.unlockType,
    unlockTier: payload.unlockType === 'tier' ? (payload.unlockTier || 'C') : (payload.unlockTier || 'C'),
    unlockLevel: payload.unlockType === 'level' ? (Number(payload.unlockLevel) || 1) : 1,
    imageFile: payload.imageFile || null,
    compatibleSpecies: Array.isArray(payload.compatibleSpecies) ? payload.compatibleSpecies.filter(Boolean) : [],
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetItem.create(doc)
  invalidateCache(orgId)
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId, oldId: null, newId: doc.imageFile,
      entity: REF_ENTITY.PET_ITEM, entityId: created._id, field: 'imageFile'
    })
  }
  return created.toObject()
}

async function updateItem({ orgId, id, payload, operatorId }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetItem.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('装饰不存在')

  const updates = {}
  if (payload.name !== undefined) updates.name = String(payload.name).trim()
  if (payload.slot !== undefined) updates.slot = payload.slot
  if (payload.unlockType !== undefined) updates.unlockType = payload.unlockType
  if (payload.unlockTier !== undefined) updates.unlockTier = payload.unlockTier
  if (payload.unlockLevel !== undefined) updates.unlockLevel = Number(payload.unlockLevel) || 1
  if (payload.compatibleSpecies !== undefined) updates.compatibleSpecies = Array.isArray(payload.compatibleSpecies) ? payload.compatibleSpecies.filter(Boolean) : []
  if (payload.isActive !== undefined) updates.isActive = !!payload.isActive
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.imageFile !== undefined) updates.imageFile = payload.imageFile || null
  updates.updatedBy = operatorId

  const oldImageFile = doc.imageFile ? doc.imageFile.toString() : null
  const updated = await PetItem.findByIdAndUpdate(doc._id, { $set: updates }, { new: true })
  invalidateCache(orgId)

  if (payload.imageFile !== undefined) {
    await fileBind.diffSingleById({
      orgId, oldId: oldImageFile, newId: updated.imageFile ? updated.imageFile.toString() : null,
      entity: REF_ENTITY.PET_ITEM, entityId: doc._id, field: 'imageFile'
    })
  }
  return updated.toObject()
}

function itemUsageChecks(orgId, key) {
  return [
    {
      model: PetAccount,
      filter: { org: orgId, unlocked: key },
      label: '已解锁此装饰的宠物',
      hint: '装饰删除后历史解锁记录失效，请先下架'
    }
  ]
}

async function removableCheckItem({ orgId, id }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetItem.findOne({ _id: id }).lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'PetItem', label: '装饰', count: 0, hint: '装饰不存在' }] }
  if (!doc.org || String(doc.org) !== String(orgId)) return { canRemove: false, blockers: [{ entity: 'PetItem', label: '装饰', count: 0, hint: '装饰不存在或不属于本机构' }] }
  return removable.check(orgId, itemUsageChecks(orgId, doc.key))
}

async function removeItem({ orgId, id }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetItem.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('装饰不存在')
  await removable.assertUnused(orgId, itemUsageChecks(orgId, doc.key))
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId, oldId: doc.imageFile.toString(), newId: null,
      entity: REF_ENTITY.PET_ITEM, entityId: doc._id, field: 'imageFile'
    })
  }
  await doc.deleteOne()
  invalidateCache(orgId)
  return { deleted: true }
}

/* ─── Consumable CRUD ─────────────────────────────────── */

async function listConsumables({ orgId, kind, isActive, keyword }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const baseFilter = {}
  if (kind) baseFilter.kind = kind
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ orgId, Model: PetConsumable, type: 'consumables', baseFilter, keyword })
}

async function getConsumable({ orgId, id }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const doc = await PetConsumable.findOne({ _id: id }).populate('imageFile', 'url mime originalName').lean()
  if (!doc) throw ApiError.notFound('消耗品不存在')
  if (doc.org && String(doc.org) !== String(orgId)) throw ApiError.notFound('消耗品不存在')
  return doc
}

async function createConsumable({ orgId, payload, operatorId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  if (!payload.key || !payload.name || !payload.kind || !payload.applicableTier) {
    throw ApiError.badRequest('key/name/kind/applicableTier 必填')
  }
  const exists = await PetConsumable.findOne({ org: orgId, key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`消耗品 key=${payload.key} 已存在`)

  const perTier = buildPerTierPayload(payload.perTier || {}, payload.applicableTier)

  const doc = {
    org: orgId,
    key: payload.key.trim(),
    name: payload.name.trim(),
    kind: payload.kind,
    applicableTier: payload.applicableTier,
    perTier,
    imageFile: payload.imageFile || null,
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetConsumable.create(doc)
  invalidateCache(orgId)
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId, oldId: null, newId: doc.imageFile,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: created._id, field: 'imageFile'
    })
  }
  return created.toObject()
}

function buildPerTierPayload(input, applicableTier) {
  // 校验：必须填 applicableTier 对应的行
  const out = { C: null, B: null, A: null, S: null, all: null }
  if (applicableTier === 'all') {
    const v = input.all
    if (!v || !Number.isFinite(Number(v.pointCost))) {
      throw ApiError.badRequest('applicableTier=all 时必须填 perTier.all.pointCost')
    }
    out.all = {
      pointCost: Number(v.pointCost),
      hungerRestore: Number(v.hungerRestore) || 0,
      expGain: Number(v.expGain) || 0
    }
  } else {
    const v = input[applicableTier]
    if (!v || !Number.isFinite(Number(v.pointCost))) {
      throw ApiError.badRequest(`applicableTier=${applicableTier} 时必须填 perTier.${applicableTier}.pointCost`)
    }
    out[applicableTier] = {
      pointCost: Number(v.pointCost),
      hungerRestore: Number(v.hungerRestore) || 0,
      expGain: Number(v.expGain) || 0
    }
  }
  return out
}

async function updateConsumable({ orgId, id, payload, operatorId }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetConsumable.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('消耗品不存在')

  const updates = {}
  if (payload.name !== undefined) updates.name = String(payload.name).trim()
  if (payload.kind !== undefined) updates.kind = payload.kind
  if (payload.applicableTier !== undefined) updates.applicableTier = payload.applicableTier
  if (payload.perTier !== undefined) updates.perTier = buildPerTierPayload(payload.perTier, payload.applicableTier || doc.applicableTier)
  if (payload.isActive !== undefined) updates.isActive = !!payload.isActive
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.imageFile !== undefined) updates.imageFile = payload.imageFile || null
  updates.updatedBy = operatorId

  const oldImageFile = doc.imageFile ? doc.imageFile.toString() : null
  const updated = await PetConsumable.findByIdAndUpdate(doc._id, { $set: updates }, { new: true })
  invalidateCache(orgId)

  if (payload.imageFile !== undefined) {
    await fileBind.diffSingleById({
      orgId, oldId: oldImageFile, newId: updated.imageFile ? updated.imageFile.toString() : null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'imageFile'
    })
  }
  return updated.toObject()
}

function consumableUsageChecks(orgId, key) {
  // PetAccount 自身不存 consumable 引用；历史消费由 PetEvent payload 审计 → 不需要互锁
  return []
}

async function removableCheckConsumable({ orgId, id }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetConsumable.findOne({ _id: id }).lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'PetConsumable', label: '消耗品', count: 0, hint: '消耗品不存在' }] }
  if (!doc.org || String(doc.org) !== String(orgId)) return { canRemove: false, blockers: [{ entity: 'PetConsumable', label: '消耗品', count: 0, hint: '消耗品不存在或不属于本机构' }] }
  return removable.check(orgId, consumableUsageChecks(orgId, doc.key))
}

async function removeConsumable({ orgId, id }) {
  if (!orgId || !id) throw ApiError.badRequest('缺少 orgId/id')
  const doc = await PetConsumable.findOne({ _id: id, org: orgId })
  if (!doc) throw ApiError.notFound('消耗品不存在')
  await removable.assertUnused(orgId, consumableUsageChecks(orgId, doc.key))
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId, oldId: doc.imageFile.toString(), newId: null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'imageFile'
    })
  }
  await doc.deleteOne()
  invalidateCache(orgId)
  return { deleted: true }
}

module.exports = {
  // species
  listSpecies, getSpecies, createSpecies, updateSpecies, removeSpecies, removableCheckSpecies,
  // items
  listItems, getItem, createItem, updateItem, removeItem, removableCheckItem,
  // consumables
  listConsumables, getConsumable, createConsumable, updateConsumable, removeConsumable, removableCheckConsumable,
  // 内部导出（test/调试）
  sanitizeSvg, listMerged
}