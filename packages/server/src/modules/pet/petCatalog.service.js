'use strict'

/**
 * Pet Catalog Read Service（2026-06-21 pet-system-v2-ext）
 *
 * 给 pet.service / pet.controller / petAdmin.service 用的"读 DB"层。
 * 取代 v1 直接 require('@shared/petSpecies.js') / petItems.js。
 *
 * 设计目标：
 *   - DB 优先（per-org + org=null 平台默认合并）
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

/**
 * 通用 list 工具：per-org + org=null 合并
 */
async function _listMerged({ orgId, Model, baseFilter = {}, keyword }) {
  if (!orgId) throw new Error('petCatalog._listMerged: orgId required')
  const ownKeys = await Model.distinct('key', { org: orgId, ...baseFilter })
  const filter = {
    $and: [
      { ...baseFilter },
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
}

/* ─── Species ─────────────────────────────────── */

async function listSpecies({ orgId, tier, isActive, keyword }) {
  const filterKey = JSON.stringify({ tier, isActive, keyword })
  return withCache(`petCatalog:species:${orgId}:${filterKey}`, async () => {
    const base = {}
    if (tier) base.tier = tier
    if (isActive !== undefined) base.isActive = isActive
    let items = await _listMerged({ orgId, Model: PetSpecies, baseFilter: base, keyword })
    if (items.length === 0) {
      // eslint-disable-next-line no-console
      console.warn('[petCatalog.listSpecies] DB 空，fallback shared/petSpecies')
      items = sharedPetSpecies.PET_SPECIES
        .filter(s => !tier || s.tier === tier)
        .map(s => ({ ...s, org: null, imageFile: null, visualType: 'image', isActive: true }))
    }
    return items
  }, 300_000)
}

async function getSpecies({ orgId, key }) {
  if (!orgId || !key) return null
  let doc = await PetSpecies.findOne({ org: orgId, key }).populate('imageFile', 'url mime').lean()
  if (!doc) {
    doc = await PetSpecies.findOne({ org: null, key }).populate('imageFile', 'url mime').lean()
  }
  if (doc) return doc
  const shared = sharedPetSpecies.getSpecies(key)
  if (shared) {
    return { ...shared, org: null, imageFile: null, visualType: 'image', isActive: true, _fallback: true }
  }
  return null
}

/**
 * 加权随机抽一个 species（破壳时用）。
 */
async function rollSpecies({ orgId, tier }) {
  const pool = await listSpecies({ orgId, tier, isActive: true })
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

async function listItems({ orgId, slot, isActive, unlockType, tier, level, keyword }) {
  const filterKey = JSON.stringify({ slot, isActive, unlockType, tier, level, keyword })
  return withCache(`petCatalog:items:${orgId}:${filterKey}`, async () => {
    const base = {}
    if (slot) base.slot = slot
    if (isActive !== undefined) base.isActive = isActive
    if (unlockType) base.unlockType = unlockType
    if (tier) base.unlockTier = tier
    let items = await _listMerged({ orgId, Model: PetItem, baseFilter: base, keyword })
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
        .map(it => ({ ...it, org: null, imageFile: null, slot: it.type, isActive: true }))
    }
    return items
  }, 300_000)
}

async function getItem({ orgId, key }) {
  if (!orgId || !key) return null
  let doc = await PetItem.findOne({ org: orgId, key }).populate('imageFile', 'url mime').lean()
  if (!doc) {
    doc = await PetItem.findOne({ org: null, key }).populate('imageFile', 'url mime').lean()
  }
  if (doc) return doc
  const shared = sharedPetItems.getItem(key)
  if (shared) {
    return { ...shared, org: null, imageFile: null, slot: shared.type, isActive: true, _fallback: true }
  }
  return null
}

/**
 * 升级解锁：返回当前等级下应解锁的 item keys（仅 level 解锁型）。
 * 沿用 v1 逻辑：unlockTier ≤ petTier 且 unlockLevel ≤ petLevel 的都解锁。
 */
async function listItemsUnlockedAtLevel({ orgId, tier, level }) {
  const tierOrder = PET_TIERS
  const tierIdx = tierOrder.indexOf(tier)
  const candidates = await listItems({ orgId, unlockType: 'level', isActive: true })
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
async function listItemsUnlockedAtTier({ orgId, tier }) {
  const candidates = await listItems({ orgId, unlockType: 'tier', isActive: true })
  return candidates
    .filter(it => it.unlockTier === tier && ['halo', 'background'].includes(it.slot))
    .map(it => it.key)
}

/* ─── Consumables ─────────────────────────────────── */

async function listConsumables({ orgId, kind, isActive, applicableTier, keyword }) {
  const filterKey = JSON.stringify({ kind, isActive, applicableTier, keyword })
  return withCache(`petCatalog:consumables:${orgId}:${filterKey}`, async () => {
    const base = {}
    if (kind) base.kind = kind
    if (isActive !== undefined) base.isActive = isActive
    if (applicableTier) base.applicableTier = { $in: [applicableTier, 'all'] }
    return _listMerged({ orgId, Model: PetConsumable, baseFilter: base, keyword })
  }, 300_000)
}

/**
 * 按 key + tier 查 consumable 适用配置。
 * 返回 { consumable, perTierConfig } 或 null。
 */
async function findConsumable({ orgId, key, tier }) {
  if (!orgId || !key) return null
  let doc = await PetConsumable.findOne({ org: orgId, key, isActive: true }).lean()
  if (!doc) {
    doc = await PetConsumable.findOne({ org: null, key, isActive: true }).lean()
  }
  if (!doc) return null
  if (doc.applicableTier !== 'all' && doc.applicableTier !== tier) return null
  const cfg = doc.perTier && (doc.perTier[tier] || doc.perTier.all)
  if (!cfg) return null
  return { consumable: doc, perTierConfig: cfg }
}

/**
 * 列出当前 petTier 可用的 food/toy。
 */
async function listConsumablesApplicableTo({ orgId, tier, kind }) {
  return listConsumables({ orgId, kind, applicableTier: tier, isActive: true })
}

/* ─── 缓存失效 ─────────────────────────────────── */

function invalidateCatalogCache(orgId) {
  invalidateCache(orgId)
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