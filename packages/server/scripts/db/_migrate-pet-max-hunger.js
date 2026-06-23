'use strict'

/**
 * 一次性迁移: PetAccount.maxHunger 从 100 升到 1000 (2026-06-23)
 *
 * 背景: petConfig.MAX_HUNGER 从 100 改成 1000，所有 PetAccount 新建/破壳/升阶
 *       现在都用 1000，但历史数据 maxHunger 还是 100。需要批量回填。
 *
 * 策略 (per [[dev-stage-no-backcompat]] 开发阶段决策):
 *   - 直接 updateMany，不写兼容 shim
 *   - 不改 currentHunger (用户已投入的饱腹度保留)
 *
 * 用法: node scripts/db/_migrate-pet-max-hunger.js [--dry-run]
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const PetAccount = require('@models/PetAccount.model')

const DRY_RUN = process.argv.includes('--dry-run')
const NEW_MAX = 1000

async function main() {
  console.log(`[migrate-pet-max-hunger] starting ${DRY_RUN ? '(DRY RUN)' : ''}`)

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rgzw')
  console.log(`[migrate-pet-max-hunger] connected to ${mongoose.connection.db.databaseName}`)

  // 查需要迁移的
  const needs = await PetAccount.countDocuments({
    $or: [
      { maxHunger: { $exists: false } },
      { maxHunger: { $lte: 100 } },
      { maxHunger: { $ne: NEW_MAX } }
    ]
  })
  console.log(`[migrate-pet-max-hunger] docs needing migration: ${needs}`)

  if (DRY_RUN || needs === 0) {
    console.log('[migrate-pet-max-hunger] no changes (dry-run or empty)')
    await mongoose.disconnect()
    process.exit(0)
  }

  // 批量回填
  const result = await PetAccount.updateMany(
    {
      $or: [
        { maxHunger: { $exists: false } },
        { maxHunger: { $lte: 100 } },
        { maxHunger: { $ne: NEW_MAX } }
      ]
    },
    { $set: { maxHunger: NEW_MAX } }
  )
  console.log(`[migrate-pet-max-hunger] modified: ${result.modifiedCount}`)

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error('[migrate-pet-max-hunger] FAILED:', e)
  process.exit(1)
})