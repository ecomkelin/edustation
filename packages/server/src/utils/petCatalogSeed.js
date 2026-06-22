'use strict'

/**
 * Pet Catalog 种子 seeder（2026-06-22 user SVG 决策）。
 *
 * 启动时跑一次（main.js require 触发）：
 *   1. 清空 pet_species / pet_items / pet_consumables 三表所有记录
 *   2. 从 @utils/_petCatalog 灌入种子（含内联 SVG）
 *   3. 重建索引
 *
 * 设计：hard reset（[[dev-stage-no-backcompat]]）—— 不保留任何 v1 数据形态；
 *       admin 改过的 catalog 也会被覆盖（开发期可接受）。
 *
 * 上线后需改为：按 key 差量更新（admin 改的不动；只补缺失的）。
 */
const PetSpecies = require('@models/PetSpecies.model')
const PetItem = require('@models/PetItem.model')
const PetConsumable = require('@models/PetConsumable.model')
const seed = require('@utils/_petCatalog')
const { invalidate: invalidateCache } = require('@modules/report/reportCache')

let _executed = false

/**
 * 同步执行种子（不 await 内部，但 main.js 可以 await 本函数）。
 */
async function runPetCatalogSeed() {
  if (_executed) return { skipped: true }
  _executed = true

  // 1. 统计当前
  const sBefore = await PetSpecies.countDocuments({})
  const iBefore = await PetItem.countDocuments({})
  const cBefore = await PetConsumable.countDocuments({})

  // 2. 清空
  await PetSpecies.deleteMany({})
  await PetItem.deleteMany({})
  await PetConsumable.deleteMany({})

  // 3. 灌种子
  const now = new Date()
  const speciesDocs = seed.SPECIES.map(s => ({ ...s, createdAt: now, updatedAt: now }))
  const itemDocs = seed.ITEMS.map(it => ({ ...it, createdAt: now, updatedAt: now }))
  const consumableDocs = seed.CONSUMABLES.map(c => ({ ...c, createdAt: now, updatedAt: now }))

  const sInserted = await PetSpecies.insertMany(speciesDocs)
  const iInserted = await PetItem.insertMany(itemDocs)
  const cInserted = await PetConsumable.insertMany(consumableDocs)

  // 4. 清缓存（catalog 改了一定要 invalidate，否则 client 看到旧数据）
  invalidateCache('species')
  invalidateCache('items')
  invalidateCache('consumables')

  // eslint-disable-next-line no-console
  console.log(`[pet-catalog-seed] cleared=species:${sBefore},items:${iBefore},consumables:${cBefore} | seeded=species:${sInserted.length},items:${iInserted.length},consumables:${cInserted.length}`)

  return {
    cleared: { species: sBefore, items: iBefore, consumables: cBefore },
    seeded: {
      species: sInserted.length,
      items: iInserted.length,
      consumables: cInserted.length
    }
  }
}

module.exports = { runPetCatalogSeed }