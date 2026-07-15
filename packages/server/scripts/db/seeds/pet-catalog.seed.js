'use strict'

/**
 * 宠物图鉴种子（pet-catalog.seed.js，2026-06-22；2026-07-15 重构：删装饰 items）
 *
 * 数据源 = src/utils/_petCatalog/{species,consumables}.js
 *   species（video/svg）+ consumables（扁平数值）
 *
 * 平台级共享（catalog 无 org），只插 1 份；唯一索引 = key（全局）。
 *
 * 幂等策略（按 key upsert）：已存在跳过；不存在 insertOne。
 * --reset 强制 drop + create（catalog 改动后整库重灌）。
 */

const PetSpecies = require('@models/PetSpecies.model')
const PetConsumable = require('@models/PetConsumable.model')
const seedData = require('@utils/_petCatalog')

/**
 * 跑幂等 upsert
 * @param {Object} [opts]
 * @param {boolean} [opts.reset=false] - true 时先 drop 再 create
 */
async function run({ reset = false } = {}) {
  const speciesList = seedData.SPECIES
  const consumableList = seedData.CONSUMABLES

  const summary = {
    species: { inserted: 0, updated: 0, skipped: 0, dropped: 0 },
    consumables: { inserted: 0, updated: 0, skipped: 0, dropped: 0 }
  }

  if (reset) {
    // eslint-disable-next-line no-console
    console.log('[seed.pet-catalog] --reset 模式：先清空 species / consumables collection')
    await PetSpecies.deleteMany({})
    await PetConsumable.deleteMany({})
    summary.species.dropped = speciesList.length
    summary.consumables.dropped = consumableList.length
  }

  // ── species ──
  for (const s of speciesList) {
    if (!reset) {
      const existing = await PetSpecies.findOne({ key: s.key }).select('_id').lean()
      if (existing) { summary.species.skipped += 1; continue }
    }
    await PetSpecies.create({ ...s, hungerDecayMinutes: s.hungerDecayMinutes || 60 })
    summary.species.inserted += 1
  }

  // ── consumables ──
  for (const c of consumableList) {
    if (!reset) {
      const existing = await PetConsumable.findOne({ key: c.key }).select('_id').lean()
      if (existing) { summary.consumables.skipped += 1; continue }
    }
    await PetConsumable.create(c)
    summary.consumables.inserted += 1
  }

  // eslint-disable-next-line no-console
  console.log('[seed.pet-catalog] summary:', JSON.stringify(summary))
  return summary
}

module.exports = { run }
