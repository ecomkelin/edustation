'use strict'

/**
 * Pet Catalog Admin Service（2026-06-21 pet-system-v2-ext；2026-07-15 重构）
 *
 * catalog（species / consumables）+ 等级配置（PetLevelConfig）的 admin 接口。
 *
 * 2026-07-15 重构：
 *   - 删装饰（PetItem）全部 CRUD
 *   - species 去 tier；visualType 固定 video（宠物本体）
 *   - consumables 去 applicableTier/perTier，改扁平 pointCost/hungerRestore/expGain；支持 video 图标
 *   - 新增 PetLevelConfig get/update（per-org 等级曲线）
 *
 * 权限：
 *   - list/get → pet.read；create/update → pet.write（+ 平台超管兜底 species/consumable）
 *   - remove → pet.write + 平台超管 + password（双因子）
 *   - level config get/update → pet.read / pet.write（per-org，机构管理员即可改本机构）
 */

const PetSpecies = require('@models/PetSpecies.model')
const PetConsumable = require('@models/PetConsumable.model')
const PetAccount = require('@models/PetAccount.model')
const PetLevelConfig = require('@models/PetLevelConfig.model')
const ApiError = require('@utils/ApiError')
const removable = require('@utils/removable')
const fileBind = require('@modules/storage/fileBind')
const { withCache, invalidate: invalidateCache } = require('@modules/report/reportCache')
const { REF_ENTITY } = require('@models/File.model')
const { normalizeLevelConfig, normalizeLevelOverrides, rowsToLevelOverrides, LOCKED_EXP_INCREMENT } = require('@shared/petConfig')

/* ─── SVG XSS sanitize ─────────────────────────────────── */
function sanitizeSvg(input) {
  if (typeof input !== 'string') return null
  let s = input.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*'[^']*'/gi, '')
  s = s.replace(/\s+on[a-z]+\s*=\s*[^\s>]+/gi, '')
  return s.trim() || null
}

/* ─── 通用 list（平台级，无 org 维度） ─── */
async function listMerged({ Model, type, baseFilter = {}, keyword, populateFields = ['videoFile'] }) {
  const filterKey = JSON.stringify({ baseFilter, keyword })
  return withCache(`${type}:global:${filterKey}`, async () => {
    const filter = { ...baseFilter }
    if (keyword && String(keyword).trim()) {
      filter.name = { $regex: String(keyword).trim(), $options: 'i' }
    }
    let q = Model.find(filter)
    for (const f of populateFields) {
      q = q.populate(f, 'url mime originalName')
    }
    return q.sort({ kind: 1, key: 1 }).lean()
  }, 300_000)
}

/* ─── Species CRUD（去 tier，video-only） ─────────────────────────────────── */

async function listSpecies({ isActive, keyword }) {
  const baseFilter = {}
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ Model: PetSpecies, type: 'species', baseFilter, keyword, populateFields: ['videoFile'] })
}

async function getSpecies({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetSpecies.findOne({ _id: id })
    .populate('videoFile', 'url mime originalName')
    .lean()
  if (!doc) throw ApiError.notFound('物种不存在')
  return doc
}

async function createSpecies({ payload, operatorId }) {
  if (!payload.key || !payload.name) {
    throw ApiError.badRequest('key/name 必填')
  }
  const visualType = payload.visualType || 'video'
  const exists = await PetSpecies.findOne({ key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`物种 key=${payload.key} 已存在`)

  const doc = {
    key: payload.key.trim(),
    name: payload.name.trim(),
    visualType,
    svgContent: visualType === 'svg' ? sanitizeSvg(payload.svgContent) : null,
    videoFile: visualType === 'video' ? (payload.videoFile || null) : null,
    maxLevel: Math.max(1, Math.min(100, Number(payload.maxLevel) || 12)),
    weight: Number(payload.weight) || 100,
    hungerDecayMinutes: Number(payload.hungerDecayMinutes) || 60,
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetSpecies.create(doc)
  invalidateCache('species')
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: null, newId: doc.videoFile,
      entity: REF_ENTITY.PET_SPECIES, entityId: created._id, field: 'videoFile'
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
  if (payload.visualType !== undefined) updates.visualType = payload.visualType
  if (payload.maxLevel !== undefined) updates.maxLevel = Math.max(1, Math.min(100, Number(payload.maxLevel) || 1))
  if (payload.weight !== undefined) updates.weight = Number(payload.weight) || 0
  if (payload.hungerDecayMinutes !== undefined) updates.hungerDecayMinutes = Number(payload.hungerDecayMinutes) || 60
  if (payload.isActive !== undefined) updates.isActive = !!payload.isActive
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.svgContent !== undefined && doc.visualType === 'svg') {
    updates.svgContent = sanitizeSvg(payload.svgContent)
  }
  if (payload.videoFile !== undefined && doc.visualType === 'video') {
    updates.videoFile = payload.videoFile || null
  }
  updates.updatedBy = operatorId

  const oldVideoFile = doc.videoFile ? doc.videoFile.toString() : null
  const updated = await PetSpecies.findByIdAndUpdate(doc._id, { $set: updates }, { new: true })
  invalidateCache('species')

  if (doc.visualType === 'video' && payload.videoFile !== undefined) {
    await fileBind.diffSingleById({
      orgId: null, oldId: oldVideoFile, newId: updated.videoFile ? updated.videoFile.toString() : null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'videoFile'
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
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: doc.videoFile.toString(), newId: null,
      entity: REF_ENTITY.PET_SPECIES, entityId: doc._id, field: 'videoFile'
    })
  }
  await doc.deleteOne()
  invalidateCache('species')
  return { deleted: true }
}

/* ─── Consumable CRUD（扁平数值，去 tier） ─────────────────────────────────── */

async function listConsumables({ kind, isActive, keyword }) {
  const baseFilter = {}
  if (kind) baseFilter.kind = kind
  if (isActive !== undefined) baseFilter.isActive = isActive
  return listMerged({ Model: PetConsumable, type: 'consumables', baseFilter, keyword, populateFields: ['videoFile'] })
}

async function getConsumable({ id }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id })
    .populate('videoFile', 'url mime originalName')
    .lean()
  if (!doc) throw ApiError.notFound('消耗品不存在')
  return doc
}

async function createConsumable({ payload, operatorId }) {
  if (!payload.key || !payload.name || !payload.kind) {
    throw ApiError.badRequest('key/name/kind 必填')
  }
  if (!Number.isFinite(Number(payload.pointCost))) {
    throw ApiError.badRequest('pointCost 必填')
  }
  const exists = await PetConsumable.findOne({ key: payload.key }).lean()
  if (exists) throw ApiError.conflict(`消耗品 key=${payload.key} 已存在`)

  const visualType = payload.visualType || 'svg'
  const doc = {
    key: payload.key.trim(),
    name: payload.name.trim(),
    kind: payload.kind,
    pointCost: Number(payload.pointCost),
    hungerRestore: Number(payload.hungerRestore) || 0,
    expGain: Number(payload.expGain) || 0,
    visualType,
    svgContent: visualType === 'svg' ? sanitizeSvg(payload.svgContent) : null,
    videoFile: visualType === 'video' ? (payload.videoFile || null) : null,
    isActive: payload.isActive !== false,
    description: payload.description || null,
    createdBy: operatorId,
    updatedBy: operatorId
  }
  const created = await PetConsumable.create(doc)
  invalidateCache('consumables')
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: null, newId: doc.videoFile,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: created._id, field: 'videoFile'
    })
  }
  return created.toObject()
}

async function updateConsumable({ id, payload, operatorId }) {
  if (!id) throw ApiError.badRequest('缺少 id')
  const doc = await PetConsumable.findOne({ _id: id })
  if (!doc) throw ApiError.notFound('消耗品不存在')

  const updates = {}
  if (payload.name !== undefined) updates.name = String(payload.name).trim()
  if (payload.kind !== undefined) updates.kind = payload.kind
  if (payload.pointCost !== undefined) updates.pointCost = Number(payload.pointCost) || 0
  if (payload.hungerRestore !== undefined) updates.hungerRestore = Number(payload.hungerRestore) || 0
  if (payload.expGain !== undefined) updates.expGain = Number(payload.expGain) || 0
  if (payload.isActive !== undefined) updates.isActive = !!payload.isActive
  if (payload.description !== undefined) updates.description = payload.description
  if (payload.visualType !== undefined) updates.visualType = payload.visualType
  if (payload.svgContent !== undefined && doc.visualType === 'svg') {
    updates.svgContent = sanitizeSvg(payload.svgContent)
  }
  if (payload.videoFile !== undefined && doc.visualType === 'video') {
    updates.videoFile = payload.videoFile || null
  }
  updates.updatedBy = operatorId

  const oldVideoFile = doc.videoFile ? doc.videoFile.toString() : null
  const updated = await PetConsumable.findByIdAndUpdate(doc._id, { $set: updates }, { new: true })
  invalidateCache('consumables')

  if (doc.visualType === 'video' && payload.videoFile !== undefined) {
    await fileBind.diffSingleById({
      orgId: null, oldId: oldVideoFile, newId: updated.videoFile ? updated.videoFile.toString() : null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'videoFile'
    })
  }
  return updated.toObject()
}

function consumableUsageChecks() {
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
  if (doc.videoFile) {
    await fileBind.diffSingleById({
      orgId: null, oldId: doc.videoFile.toString(), newId: null,
      entity: REF_ENTITY.PET_CONSUMABLE, entityId: doc._id, field: 'videoFile'
    })
  }
  await doc.deleteOne()
  invalidateCache('consumables')
  return { deleted: true }
}

/* ─── Level Config（per-org 等级配置） ─────────────────────────────────── */

async function getLevelConfig({ orgId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const doc = await PetLevelConfig.findOne({ org: orgId }).lean()
  const cfg = normalizeLevelConfig(doc)
  return { ...cfg, exists: !!doc }
}

async function updateLevelConfig({ orgId, payload, operatorId }) {
  if (!orgId) throw ApiError.badRequest('缺少 orgId')
  const updates = {}
  if (payload.expBase !== undefined) updates.expBase = Math.max(1, Number(payload.expBase) || 1)
  // expIncrement 已锁定（LOCKED_EXP_INCREMENT=300，2026-07-16 产品决策）：
  // 忽略入参里的任何值；即使 DB 里有旧值也会被 $set 强制覆盖成常量。
  if (payload.levelExpOverrides !== undefined) {
    // 接受前端 rows 数组 [{level, exp}] 或后端 dict；归一化为 [{level, exp}]
    updates.levelExpOverrides = rowArrToOverrides(payload.levelExpOverrides)
  }
  // 强制写入常量（抹掉 DB 里可能存的旧 expIncrement）
  updates.expIncrement = LOCKED_EXP_INCREMENT
  updates.updatedBy = operatorId
  const doc = await PetLevelConfig.findOneAndUpdate(
    { org: orgId },
    { $set: updates, $setOnInsert: { org: orgId } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean()
  const cfg = normalizeLevelConfig(doc)
  return { ...cfg, exists: !!doc }
}

// 接受数组 (rows) 或 dict (keyed by level)；归一化为按 level 升序的数组
function rowArrToOverrides(input) {
  if (!input) return []
  let dict
  if (Array.isArray(input)) {
    dict = rowsToLevelOverrides(input)
  } else if (typeof input === 'object') {
    dict = normalizeLevelOverrides(input)
  } else {
    return []
  }
  return Object.keys(dict)
    .map(k => ({ level: Number(k), exp: dict[k] }))
    .sort((a, b) => a.level - b.level)
}

module.exports = {
  // species
  listSpecies, getSpecies, createSpecies, updateSpecies, removeSpecies, removableCheckSpecies,
  // consumables
  listConsumables, getConsumable, createConsumable, updateConsumable, removeConsumable, removableCheckConsumable,
  // level config
  getLevelConfig, updateLevelConfig,
  // 内部导出（test/调试）
  sanitizeSvg, listMerged
}
