'use strict'

/**
 * Pet Catalog Read Service（2026-06-21 pet-system-v2-ext / 2026-06-22 重构）
 *
 * 给 pet.service / pet.controller / petAdmin.service 用的"读 DB"层。
 * 取代 v1 直接 require('@shared/petSpecies.js') / petItems.js。
 *
 * 2026-06-22 改造：catalog 完全平台级共享（去除 per-org override）。
 *   - 所有 org 看到同一份图鉴
 *   - orgId 参数保留（兼容现有 pet.service 调用），但**不再**用于过滤
 *
 * 设计目标：
 *   - DB 优先
 *   - 缓存 5min TTL（写操作 invalidateCatalogCache）
 *   - DB 完全无数据时 fallback 到 shared/pet*.js（仅 dev 兜底；log warn）
 *   - 兼容 v1：PetAccount.species/unlocked/equipped 仍是 key 字符串
 *
 * 关键 API：
 *   - listSpecies / getSpecies / rollSpecies
 *   - listItems / getItem / listItemsUnlockedAtLevel / listItemsUnlockedAtTier
 *   - listConsumables / findConsumable / listConsumablesApplicableTo
 *   - invalidateCatalogCache
 */

const PetSpecies = require('@models/PetSpecies.model')
const PetItem = require('@models/PetItem.model')
const PetConsumable = require('@models/PetConsumable.model')
const { withCache, invalidate: invalidateCache } = require('@modules/report/reportCache')
const sharedPetSpecies = require('@shared/petSpecies')
const sharedPetItems = require('@shared/petItems')
const { PET_TIERS } = require('@shared/enums')

/* ─── 通用 list（平台级，无 org 维度） ─── */
/**
 * 缓存 key 设计（参照 [[report-cache-key-bucket-bug]]）：
 *   - 第一段（bucket 名）= catalog 类型（species/items/consumables），供 invalidate 精准清
 */
async function _listGlobal({ Model, baseFilter = {}, keyword }) {
  const filter = { ...baseFilter }
  if (keyword && String(keyword).trim()) {
    filter.name = { $regex: String(keyword).trim(), $options: 'i' }
  }
  return Model.find(filter)
    .populate('imageFile', 'url mime originalName')
    .sort({ tier: 1, slot: 1, kind: 1, key: 1 })
    .lean()
}

/* ─── Species ─────────────────────────────────── */

async function listSpecies({ tier, isActive, keyword }) {
  const filterKey = JSON.stringify({ tier, isActive, keyword })
  return withCache(`species:global:${filterKey}`, async () => {
    const base = {}
    if (tier) base.tier = tier
    if (isActive !== undefined) base.isActive = isActive
    let items = await _listGlobal({ Model: PetSpecies, baseFilter: base, keyword })
    if (items.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[petCatalog.listSpecies] DB 空，fallback shared/petSpecies')
      items = sharedPetSpecies.PET_SPECIES
        .filter(s => !tier || s.tier === tier)
        .map(s => ({ ...s, imageFile: null, visualType: 'image', isActive: true }))
    }
    return items
  }, 300_000)
}

async function getSpecies({ key }) {
  if (!key) return null
  let doc = await PetSpecies.findOne({ key }).populate('imageFile', 'url mime').lean()
  if (doc) return doc
  const shared = sharedPetSpecies.getSpecies(key)
  if (shared) {
    return { ...shared, imageFile: null, visualType: 'image', isActive: true, _fallback: true }
  }
  return null
}

/**
 * 加权随机抽一个 species（破壳时用）。
 */
async function rollSpecies({ tier }) {
  const pool = await listSpecies({ tier, isActive: true })
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

/* ─── Items ─────────────────────────────────── */

async function listItems({ slot, isActive, unlockType, tier, level, keyword }) {
  const filterKey = JSON.stringify({ slot, isActive, unlockType, tier, level, keyword })
  return withCache(`items:global:${filterKey}`, async () => {
    const base = {}
    if (slot) base.slot = slot
    if (isActive !== undefined) base.isActive = isActive
    if (unlockType) base.unlockType = unlockType
    if (tier) base.unlockTier = tier
    let items = await _listGlobal({ Model: PetItem, baseFilter: base, keyword })
    if (items.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[petCatalog.listItems] DB 空，fallback shared/petItems')
      items = sharedPetItems.PET_ITEMS
        .filter(it => {
          if (slot && it.type !== slot) return false
          if (tier && it.unlockTier !== tier) return false
          if (level !== undefined && it.unlockLevel > level) return false
          return true
        })
        .map(it => ({ ...it, imageFile: null, slot: it.type, isActive: true }))
    }
    return items
  }, 300_000)
}

async function getItem({ key }) {
  if (!key) return null
  let doc = await PetItem.findOne({ key }).populate('imageFile', 'url mime').lean()
  if (doc) return doc
  const shared = sharedPetItems.getItem(key)
  if (shared) {
    return { ...shared, imageFile: null, slot: shared.type, isActive: true, _fallback: true }
  }
  return null
}

/**
 * 升级解锁：返回当前等级下应解锁的 item keys（仅 level 解锁型）。
 * 沿用 v1 逻辑：unlockTier ≤ petTier 且 unlockLevel ≤ petLevel 的都解锁。
 */
async function listItemsUnlockedAtLevel({ tier, level }) {
  const tierOrder = PET_TIERS
  const tierIdx = tierOrder.indexOf(tier)
  const candidates = await listItems({ unlockType: 'level', isActive: true })
  return candidates
    .filter(it => {
      const itemTierIdx = tierOrder.indexOf(it.unlockTier)
      if (itemTierIdx > tierIdx) return false
      return (it.unlockLevel || 1) <= level
    })
    .map(it => it.key)
}

/**
 * 升阶解锁：返回新阶下应解锁的 halo + background item keys（tier 解锁型）。
 */
async function listItemsUnlockedAtTier({ tier }) {
  const candidates = await listItems({ unlockType: 'tier', isActive: true })
  return candidates
    .filter(it => it.unlockTier === tier && ['halo', 'background'].includes(it.slot))
    .map(it => it.key)
}

/* ─── Consumables ─────────────────────────────────── */

async function listConsumables({ kind, isActive, applicableTier, keyword }) {
  const filterKey = JSON.stringify({ kind, isActive, applicableTier, keyword })
  return withCache(`consumables:global:${filterKey}`, async () => {
    const base = {}
    if (kind) base.kind = kind
    if (isActive !== undefined) base.isActive = isActive
    if (applicableTier) base.applicableTier = { $in: [applicableTier, 'all'] }
    return _listGlobal({ Model: PetConsumable, baseFilter: base, keyword })
  }, 300_000)
}

/**
 * 按 key + tier 查 consumable 适用配置。
 * 返回 { consumable, perTierConfig } 或 null。
 */
async function findConsumable({ key, tier }) {
  if (!key) return null
  const doc = await PetConsumable.findOne({ key, isActive: true }).lean()
  if (!doc) return null
  if (doc.applicableTier !== 'all' && doc.applicableTier !== tier) return null
  const cfg = doc.perTier && (doc.perTier[tier] || doc.perTier.all)
  if (!cfg) return null
  return { consumable: doc, perTierConfig: cfg }
}

/**
 * 列出当前 petTier 可用的 food/toy。
 */
async function listConsumablesApplicableTo({ tier, kind }) {
  return listConsumables({ kind, applicableTier: tier, isActive: true })
}

/* ─── 缓存失效 ─────────────────────────────────── */

/**
 * 写操作后调用。
 * @param {string} [type] 'species' / 'items' / 'consumables' / undefined（= 清全部 catalog）
 */
function invalidateCatalogCache(type) {
  if (type) {
    invalidateCache(type)
  } else {
    invalidateCache('species')
    invalidateCache('items')
    invalidateCache('consumables')
  }
}

module.exports = {
  // species
  listSpecies, getSpecies, rollSpecies,
  // items
  listItems, getItem, listItemsUnlockedAtLevel, listItemsUnlockedAtTier,
  // consumables
  listConsumables, findConsumable, listConsumablesApplicableTo,
  // 缓存
  invalidateCatalogCache
}