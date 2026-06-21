'use strict'

/**
 * Pet Catalog Admin Service（2026-06-21 pet-system-v2-ext / 2026-06-22 重构）
 *
 * 三个 catalog（species / items / consumables）的 CRUD 通用接口：
 *   - list / get / create / update / remove / removableCheck
 *
 * 2026-06-22 改造（用户决策）：
 *   - 完全平台化管理（去除 per-org override）
 *   - 任何 org 看到同一份图鉴；写入权限由 requirePlatformAdmin middleware 兜底
 *   - API 仍带 orgId（兼容现有 controller / 路由结构），但**不再**用于过滤或写 org 字段
 *   - 删除互锁仍按"全局 key"查找 PetAccount.species / PetAccount.unlocked 引用
 *
 * 复用：
 *   - reportCache.withCache + invalidate（catalog 读 cache，写 invalidate）
 *   - fileBind.diffSingleById（imageFile 字段变更时维护 File.refs）
 *   - removable.assertUnused / check（删前互锁）
 *   - requirePlatformPassword middleware（高风险删除）
 *
 * 权限：
 *   - list / get → pet.read（任何机构岗可看）
 *   - create / update → pet.write + platform admin（路由层 requirePlatformAdmin 兜底）
 *   - remove → pet.write + platform admin + password（双因子）
 *
 * 关键设计：
 *   - SVG sanitize：写入时剥 <script> + on* 事件属性（XSS 防护）
 *   - delete 互锁：
 *       species → PetAccount.species === key（全局）
 *       item    → PetAccount.unlocked 数组包含 key（全局；equipped 不查，临时态）
 *       consumable → 无强引用，PetEvent 流水审计即可
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

/* ─── SVG XSS sanitize ─────────────────────────────────── */
/**
 * 简单 SVG sanitize：剥 <script> 标签 + on* 事件属性。
 * 不做穷举，仅防最常见 XSS 入口。
 */
function sanitizeSvg(input) {
  if (typeof input !== 'string') return null
  let s = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
  return s.trim() || null
}

/* ─── 通用 list（平台级，无 org 维度） ─── */
/**
 * 通用 list 工具。读取全部记录（无 per-org override）。
 *
 * 缓存 key 设计（参照 [[report-cache-key-bucket-bug]]）：
 *   - 第一段（bucket 名）= catalog 类型（species/items/consumables），供 invalidate 精准清
 *   - 平台级共享：所有 org 共一份图鉴，写后调 invalidate(type) 清掉该类型全部
 */
async function listMerged({ Model, type, baseFilter = {}, keyword, extraFilter = {} }) {
  const filterKey = JSON.stringify({ baseFilter, keyword, extraFilter })
  return withCache(`${type}:global:${filterKey}`, async () => {
    const filter = { ...baseFilter, ...extraFilter }
    if (keyword && String(keyword).trim()) {
      filter.name = { $regex: String(keyword).trim(), $options: 'i' }
    }
    return Model.find(filter)
      .populate('imageFile', 'url mime originalName')
      .sort({ tier: 1, slot: 1, kind: 1, key: 1 })
      .lean()
  }, 300_000) // 5min TTL
}

/* ─── Species CRUD ─────────────────────────────────── */

async function listSpecies({ tier, isActive, keyword }) {
  const baseFilter = {}
  if (tier) baseFilter.tier = tier
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ Model: PetSpecies, type: 'species', baseFilter, keyword })
}

async function getSpecies({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id }).populate('imageFile', 'url mime originalName').lean()
  if (!doc) throw ApiError.notFound('物种不存在')
  return doc
}

async function createSpecies({ payload, operatorId }) {
  if (!payload.key || !payload.name || !payload.tier || !payload.visualType) {
    throw ApiError.badRequest('key/name/tier/visualType 必填')
  }
  const exists = await PetSpecies.findOne({ key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`物种 key=${payload.key} 已存在`)

  const doc = {
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
  invalidateCache('species')
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: null, newId: doc.imageFile,
      entity: REF_ENTITY.PET_SPECIES, entityId: created._id, field: 'imageFile'
    })
  }
  return created.toObject()
}

async function updateSpecies({ id, payload, operatorId }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('物种不存在')

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
  invalidateCache('species')

  if (doc.visualType === 'image' && payload.imageFile !== undefined) {
    await fileBind.diffSingleById({
      orgId: null, oldId: oldImageFile, newId: updated.imageFile ? updated.imageFile.toString() : null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'imageFile'
    })
  }
  return updated.toObject()
}

function speciesUsageChecks(key) {
  return [
    {
      model: PetAccount,
      filter: { species: key },
      label: '宠物实例引用',
      hint: '请先将引用此物种的宠物迁移/置换后再删'
    }
  ]
}

async function removableCheckSpecies({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id }).lean()
  if (!doc) {
    return { canRemove: false, blockers: [{ entity: 'PetSpecies', label: '物种', count: 0, hint: '物种不存在' }] }
  }
  return removable.checkGlobal(speciesUsageChecks(doc.key))
}

async function removeSpecies({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('物种不存在')
  await removable.assertUnusedGlobal(speciesUsageChecks(doc.key))
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: doc.imageFile.toString(), newId: null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'imageFile'
    })
  }
  await doc.deleteOne()
  invalidateCache('species')
  return { deleted: true }
}

/* ─── Item CRUD ─────────────────────────────────── */

async function listItems({ slot, isActive, keyword }) {
  const baseFilter = {}
  if (slot) baseFilter.slot = slot
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ Model: PetItem, type: 'items', baseFilter, keyword })
}

async function getItem({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetItem.findOne({ _id: id }).populate('imageFile', 'url mime originalName').lean()
  if (!doc) throw ApiError.notFound('装饰不存在')
  return doc
}

async function createItem({ payload, operatorId }) {
  if (!payload.key || !payload.name || !payload.slot || !payload.unlockType) {
    throw ApiError.badRequest('key/name/slot/unlockType 必填')
  }
  const exists = await PetItem.findOne({ key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`装饰 key=${payload.key} 已存在`)

  const doc = {
    key: payload.key.trim(),
    name: payload.name.trim(),
    slot: payload.slot,
    unlockType: payload.unlockType,
    unlockTier: payload.unlockTier || 'C',
    unlockLevel: payload.unlockType === 'level' ? (Number(payload.unlockLevel) || 1) : 1,
    imageFile: payload.imageFile || null,
    compatibleSpecies: Array.isArray(payload.compatibleSpecies) ? payload.compatibleSpecies.filter(Boolean) : [],
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetItem.create(doc)
  invalidateCache('items')
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: null, newId: doc.imageFile,
      entity: REF_ENTITY.PET_ITEM, entityId: created._id, field: 'imageFile'
    })
  }
  return created.toObject()
}

async function updateItem({ id, payload, operatorId }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetItem.findOne({ _id: id })
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
  invalidateCache('items')

  if (payload.imageFile !== undefined) {
    await fileBind.diffSingleById({
      orgId: null, oldId: oldImageFile, newId: updated.imageFile ? updated.imageFile.toString() : null,
      entity: REF_ENTITY.PET_ITEM, entityId: doc._id, field: 'imageFile'
    })
  }
  return updated.toObject()
}

function itemUsageChecks(key) {
  return [
    {
      model: PetAccount,
      filter: { unlocked: key },
      label: '已解锁此装饰的宠物',
      hint: '装饰删除后历史解锁记录失效，请先下架'
    }
  ]
}

async function removableCheckItem({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetItem.findOne({ _id: id }).lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'PetItem', label: '装饰', count: 0, hint: '装饰不存在' }] }
  return removable.checkGlobal(itemUsageChecks(doc.key))
}

async function removeItem({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetItem.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('装饰不存在')
  await removable.assertUnusedGlobal(itemUsageChecks(doc.key))
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: doc.imageFile.toString(), newId: null,
      entity: REF_ENTITY.PET_ITEM, entityId: doc._id, field: 'imageFile'
    })
  }
  await doc.deleteOne()
  invalidateCache('items')
  return { deleted: true }
}

/* ─── Consumable CRUD ─────────────────────────────────── */

async function listConsumables({ kind, isActive, keyword }) {
  const baseFilter = {}
  if (kind) baseFilter.kind = kind
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ Model: PetConsumable, type: 'consumables', baseFilter, keyword })
}

async function getConsumable({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id }).populate('imageFile', 'url mime originalName').lean()
  if (!doc) throw ApiError.notFound('消耗品不存在')
  return doc
}

async function createConsumable({ payload, operatorId }) {
  if (!payload.key || !payload.name || !payload.kind || !payload.applicableTier) {
    throw ApiError.badRequest('key/name/kind/applicableTier 必填')
  }
  const exists = await PetConsumable.findOne({ key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`消耗品 key=${payload.key} 已存在`)

  const perTier = buildPerTierPayload(payload.perTier || {}, payload.applicableTier)

  const doc = {
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
  invalidateCache('consumables')
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: null, newId: doc.imageFile,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: created._id, field: 'imageFile'
    })
  }
  return created.toObject()
}

function buildPerTierPayload(input, applicableTier) {
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

async function updateConsumable({ id, payload, operatorId }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id })
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
  invalidateCache('consumables')

  if (payload.imageFile !== undefined) {
    await fileBind.diffSingleById({
      orgId: null, oldId: oldImageFile, newId: updated.imageFile ? updated.imageFile.toString() : null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'imageFile'
    })
  }
  return updated.toObject()
}

function consumableUsageChecks() {
  // PetAccount 自身不存 consumable 引用；历史消费由 PetEvent payload 审计 → 不需要互锁
  return []
}

async function removableCheckConsumable({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id }).lean()
  if (!doc) return { canRemove: false, blockers: [{ entity: 'PetConsumable', label: '消耗品', count: 0, hint: '消耗品不存在' }] }
  return removable.checkGlobal(consumableUsageChecks())
}

async function removeConsumable({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('消耗品不存在')
  await removable.assertUnusedGlobal(consumableUsageChecks())
  if (doc.imageFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: doc.imageFile.toString(), newId: null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'imageFile'
    })
  }
  await doc.deleteOne()
  invalidateCache('consumables')
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