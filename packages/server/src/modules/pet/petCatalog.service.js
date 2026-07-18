'use strict'

/**
 * Pet Catalog Read Service（2026-06-21 pet-system-v2-ext；2026-07-15 重构）
 *
 * 给 pet.service / pet.controller / petAdmin.service 用的"读 DB"层。
 *
 * catalog 完全平台级共享（species / consumables），所有 org 看到同一份图鉴。
 * PetLevelConfig 是 per-org（每机构一条等级曲线配置）。
 *
 * 2026-07-15 重构：
 *   - 删装饰（PetItem）：listItems / getItem / listItemsUnlockedAt* 全删
 *   - 删等阶：species / consumables 去 tier；rollSpecies 全池加权随机
 *   - findConsumable 返回扁平数值（无 perTier）
 *   - 新增 getLevelConfig（per-org 等级配置读，带默认兜底）
 *
 * 设计目标：DB 优先 + 缓存 5min TTL + DB 空时 fallback shared/petSpecies。
 */

const PetSpecies = require('@models/PetSpecies.model')
const PetConsumable = require('@models/PetConsumable.model')
const PetLevelConfig = require('@models/PetLevelConfig.model')
const { withCache, invalidate: invalidateCache } = require('@modules/report/reportCache')
const sharedPetSpecies = require('@shared/petSpecies')
const { normalizeLevelConfig } = require('@shared/petConfig')

/* ─── 通用 list（平台级，无 org 维度） ─── */
async function _listGlobal({ Model, baseFilter = {}, keyword, populateFields = ['videoFile'] }) {
  const filter = { ...baseFilter }
  if (keyword && String(keyword).trim()) {
    filter.name = { $regex: String(keyword).trim(), $options: 'i' }
  }
  let q = Model.find(filter)
  for (const f of populateFields) {
    q = q.populate(f, 'url mime originalName')
  }
  return q.sort({ kind: 1, key: 1 }).lean()
}

/* ─── Species ─────────────────────────────────── */

async function listSpecies({ isActive, keyword } = {}) {
  const filterKey = JSON.stringify({ isActive, keyword })
  return withCache(`species:global:${filterKey}`, async () => {
    const base = {}
    if (isActive !== undefined) base.isActive = isActive
    let items = await _listGlobal({
      Model: PetSpecies,
      baseFilter: base,
      keyword,
      // 2026-07-16: 加 levelVisuals.videoFile，decoratePet 需要 videoFile.url
      populateFields: ['videoFile', 'levelVisuals.videoFile']
    })
    if (items.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[petCatalog.listSpecies] DB 空，fallback shared/petSpecies')
      items = sharedPetSpecies.PET_SPECIES.map(s => ({
        ...s, videoFile: null, visualType: 'video', isActive: true
      }))
    }
    return items
  }, 300_000)
}

async function getSpecies({ key }) {
  if (!key) return null
  // 2026-07-16: 必须 populate levelVisuals.videoFile，否则 pet.service.decoratePet
  // 拿到的 currentVisual.videoFile 是 ObjectId 字符串，C 端无法渲染视频
  const doc = await PetSpecies.findOne({ key })
    .populate('videoFile', 'url mime')
    .populate('levelVisuals.videoFile', 'url mime originalName')
    .lean()
  if (doc) return doc
  const shared = sharedPetSpecies.getSpecies(key)
  if (shared) {
    return { ...shared, videoFile: null, visualType: 'video', isActive: true, _fallback: true }
  }
  return null
}

/**
 * 加权随机抽一个 species（破壳时用；全池，无 tier 分池）。
 */
async function rollSpecies() {
  const pool = await listSpecies({ isActive: true })
  if (pool.length === 0) return null
  const total = pool.reduce((sum, s) => sum + Math.max(0, s.weight || 0), 0)
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)]
  let r = Math.random() * total
  for (const s of pool) {
    r -= Math.max(0, s.weight || 0)
    if (r <= 0) return s
  }
  return pool[pool.length - 1]
}

/* ─── Consumables ─────────────────────────────────── */

async function listConsumables({ kind, isActive, keyword } = {}) {
  const filterKey = JSON.stringify({ kind, isActive, keyword })
  return withCache(`consumables:global:${filterKey}`, async () => {
    const base = {}
    if (kind) base.kind = kind
    if (isActive !== undefined) base.isActive = isActive
    return _listGlobal({
      Model: PetConsumable,
      baseFilter: base,
      keyword,
      populateFields: ['videoFile']
    })
  }, 300_000)
}

/**
 * 按 key 查 consumable 配置（无 tier；返回扁平数值）。
 * 返回 { consumable, config: { pointCost, hungerRestore, expGain } } 或 null。
 */
async function findConsumable({ key }) {
  if (!key) return null
  const doc = await PetConsumable.findOne({ key, isActive: true }).lean()
  if (!doc) return null
  return {
    consumable: doc,
    config: {
      pointCost: doc.pointCost,
      hungerRestore: doc.hungerRestore,
      expGain: doc.expGain
    }
  }
}

/* ─── Level Config（per-org 等级曲线） ─────────────── */

/**
 * 取某机构的宠物等级配置（无记录时返回归一化后的默认）。
 * 注意：最高等级已不在本表 (2026-07-16 迁 species → 2026-07-18 删字段)，本接口只返经验曲线。
 * @returns {Promise<{expBase, expIncrement, levelExpOverrides}>}
 */
async function getLevelConfig(orgId) {
  if (!orgId) return normalizeLevelConfig(null)
  const doc = await PetLevelConfig.findOne({ org: orgId }).lean()
  return normalizeLevelConfig(doc)
}

/* ─── 缓存失效 ─────────────────────────────────── */

function invalidateCatalogCache(type) {
  if (type) {
    invalidateCache(type)
  } else {
    invalidateCache('species')
    invalidateCache('consumables')
  }
}

module.exports = {
  listSpecies, getSpecies, rollSpecies,
  listConsumables, findConsumable,
  getLevelConfig,
  invalidateCatalogCache
}
