'use strict'

/**
 * Pet Catalog 种子数据汇总（2026-06-22 user SVG 决策）。
 *
 * 数据源 = 内联 SVG（16 species + 35 item + 6 consumable）。
 * 平台级共享，机构间一致。
 *
 * 使用：
 *   const seed = require('@utils/_petCatalog')
 *   await PetSpecies.insertMany(seed.SPECIES)
 */
const SPECIES = require('./species')
const ITEMS = require('./items')
const CONSUMABLES = require('./consumables')

module.exports = {
  SPECIES,
  ITEMS,
  CONSUMABLES
}