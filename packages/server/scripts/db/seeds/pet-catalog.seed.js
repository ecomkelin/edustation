'use strict'

/**
 * 宠物图鉴种子（pet-catalog.seed.js，2026-06-22）
 *
 * 数据源 = src/utils/_petCatalog/{species,items,consumables}.js
 *   16 species + 35 item + 6 consumable = 57 条内联 SVG
 *
 * 平台级共享（catalog 已去 org），只插 1 份
 *   - PetSpecies / PetItem / PetConsumable 三个 model 均无 org 字段
 *   - 唯一索引 = key（全局）
 *
 * 幂等策略（按 key upsert）：
 *   - 已存在（key 命中）→ 跳过
 *   - 不存在 → insertOne
 *   配合 --reset 命令行参数可强制 drop+insertMany（用于 catalog 改动后整库重灌）
 *
 * item.pointCost 默认定价（与食物三档 5/15/30 对仗）：
 *   - C 阶 level 解锁小件：20 / 30
 *   - B 阶：50 / 80
 *   - A 阶：120 / 180
 *   - S 阶：300 / 500
 *   - halo/background 升阶解锁：60 / 150 / 400
 */

const PetSpecies = require('@models/PetSpecies.model')
const PetItem = require('@models/PetItem.model')
const PetConsumable = require('@models/PetConsumable.model')
const seedData = require('@utils/_petCatalog')

// ─── 给 35 item 补 pointCost（按 tier + level 定价） ───
const POINT_COST_MAP = {
  // C 阶小件（unlockLevel 低=便宜）
  hat_party: 20, hat_bow_red: 30,
  scarf_red: 20, scarf_blue: 30,
  clothes_tshirt: 25, clothes_sweater: 35,
  acc_glasses: 25, acc_bell: 35,
  // B 阶
  hat_wizard: 50, hat_scarf_pink: 80,
  scarf_gold: 60,
  clothes_suit: 70,
  acc_gem_red: 60,
  // A 阶
  hat_helmet: 120, hat_laurel: 180,
  scarf_rainbow: 150,
  clothes_armor: 160,
  acc_gem_blue: 140,
  // S 阶
  hat_crown: 300, hat_horns: 500,
  scarf_galaxy: 350,
  clothes_robe: 450,
  acc_star: 320,
  // halo（升阶解锁）
  halo_basic: 60, halo_sparkle: 90,
  halo_glow: 150, halo_rainbow: 220,
  halo_divine: 400, halo_solar: 550,
  // background（升阶解锁）
  bg_meadow: 60, bg_sakura: 90,
  bg_clouds: 150, bg_ocean: 220,
  bg_galaxy: 400, bg_celestial: 550
}

function enrichItems(items) {
  return items.map((it) => ({
    ...it,
    pointCost: POINT_COST_MAP[it.key] !== undefined ? POINT_COST_MAP[it.key] : null
  }))
}

/**
 * 跑幂等 upsert
 * @param {Object} [opts]
 * @param {boolean} [opts.reset=false] - true 时先 drop 再 insertMany
 */
async function run({ reset = false } = {}) {
  const speciesList = seedData.SPECIES
  const itemList = enrichItems(seedData.ITEMS)
  const consumableList = seedData.CONSUMABLES

  // 统计
  const summary = {
    species: { inserted: 0, updated: 0, skipped: 0, dropped: 0 },
    items: { inserted: 0, updated: 0, skipped: 0, dropped: 0 },
    consumables: { inserted: 0, updated: 0, skipped: 0, dropped: 0 }
  }

  if (reset) {
    // eslint-disable-next-line no-console
    console.log('[seed.pet-catalog] --reset 模式：先清空 3 个 catalog collection')
    await PetSpecies.deleteMany({})
    await PetItem.deleteMany({})
    await PetConsumable.deleteMany({})
    summary.species.dropped = speciesList.length
    summary.items.dropped = itemList.length
    summary.consumables.dropped = consumableList.length
  }

  // ── species ──
  for (const s of speciesList) {
    if (reset) {
      await PetSpecies.create(s)
      summary.species.inserted += 1
    } else {
      const existing = await PetSpecies.findOne({ key: s.key }).select('_id').lean()
      if (existing) {
        summary.species.skipped += 1
        continue
      }
      await PetSpecies.create(s)
      summary.species.inserted += 1
    }
  }

  // ── items ──
  for (const it of itemList) {
    if (reset) {
      await PetItem.create(it)
      summary.items.inserted += 1
    } else {
      const existing = await PetItem.findOne({ key: it.key }).select('_id pointCost svgContent').lean()
      if (existing) {
        // 已存在：如果 pointCost 不一致 → 更新（首次 seed 灌完后跑会触发）
        // 如果 svgContent 为空 → 也更新（应对历史数据缺 SVG）
        const needUpdate = {}
        if (it.pointCost !== null && it.pointCost !== undefined && existing.pointCost !== it.pointCost) {
          needUpdate.pointCost = it.pointCost
        }
        if (it.svgContent && (!existing.svgContent || existing.svgContent.length < 10)) {
          needUpdate.svgContent = it.svgContent
        }
        if (Object.keys(needUpdate).length > 0) {
          await PetItem.updateOne({ _id: existing._id }, { $set: needUpdate })
          summary.items.updated += 1
        } else {
          summary.items.skipped += 1
        }
        continue
      }
      await PetItem.create(it)
      summary.items.inserted += 1
    }
  }

  // ── species ── (2026-06-23: 补默认 hungerDecayMinutes)
  for (const s of speciesList) {
    if (reset) {
      // 重置模式: PetSpecies 已通过上面 `insertMany` 写入;这里需要补 hungerDecayMinutes 字段
      // 但 _petCatalog 静态数据没带 hungerDecayMinutes,这里 hardcode 补 60
      await PetSpecies.updateOne({ key: s.key }, { $set: { hungerDecayMinutes: 60 } })
      summary.species.updated += 1
      continue
    }
    const existing = await PetSpecies.findOne({ key: s.key }).select('_id hungerDecayMinutes').lean()
    if (existing) {
      if (existing.hungerDecayMinutes == null) {
        await PetSpecies.updateOne({ _id: existing._id }, { $set: { hungerDecayMinutes: 60 } })
        summary.species.updated += 1
      } else {
        summary.species.skipped += 1
      }
      continue
    }
    // insertMany 阶段已 insert 了没 hungerDecayMinutes 字段的 species（default 60 由 schema 自动填）
    summary.species.inserted += 1
  }

  // ── consumables ──
  for (const c of consumableList) {
    if (reset) {
      await PetConsumable.create(c)
      summary.consumables.inserted += 1
    } else {
      const existing = await PetConsumable.findOne({ key: c.key }).select('_id').lean()
      if (existing) {
        summary.consumables.skipped += 1
        continue
      }
      await PetConsumable.create(c)
      summary.consumables.inserted += 1
    }
  }

  // eslint-disable-next-line no-console
  console.log('[seed.pet-catalog] summary:', JSON.stringify(summary, null, 2))
  // eslint-disable-next-line no-console
  console.log(
    `[seed.pet-catalog] total: ${summary.species.inserted + summary.species.skipped} species, ` +
      `${summary.items.inserted + summary.items.skipped} items, ` +
      `${summary.consumables.inserted + summary.consumables.skipped} consumables`
  )

  return summary
}

module.exports = { run, POINT_COST_MAP }