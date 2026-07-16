'use strict'

/**
 * 一次性去重: 同种唯一约束上线前清理 (2026-07-16)
 *
 * 背景: 2026-07-15 多宠重构时漏了「1 学生 + 1 species ≤ 1 只」约束,
 *       当前 dev DB 已有冲突 (例如 1 学生养 2 只角鹗)。
 *       上 partial unique index 前必须先 dedupe, 否则现有重复行会让
 *       createIndex 报 E11000 失败, 整个 model 加载都崩。
 *
 * 策略:
 *   - 按 (org, student, species) 分组, 只保留 adoptedAt 最早的那只
 *   - 其它 deleteOne + 写一条 PetEvent (type=admin_abandon, reason='seed-dedupe')
 *     作审计, 方便 admin 端事件流追溯
 *
 * 用法:
 *   node scripts/db/_seed-dedupe-pet-species.js           # 实际执行
 *   node scripts/db/_seed-dedupe-pet-species.js --dry-run # 只打印, 不改数据
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const mongoose = require('mongoose')
const PetAccount = require('@models/PetAccount.model')
const PetEvent = require('@models/PetEvent.model')

const DRY_RUN = process.argv.includes('--dry-run')

async function main() {
  console.log(`[seed-dedupe-pet-species] starting ${DRY_RUN ? '(DRY RUN)' : ''}`)

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rgzw')
  console.log(`[seed-dedupe-pet-species] connected to ${mongoose.connection.db.databaseName}`)

  // 聚合: 按 (org, student, species) 分组, 找出 species 非空的重复组
  const dupGroups = await PetAccount.aggregate([
    { $match: { species: { $type: 'string' } } },
    { $group: {
      _id: { org: '$org', student: '$student', species: '$species' },
      ids: { $push: '$_id' },
      adoptedAts: { $push: '$adoptedAt' },
      count: { $sum: 1 }
    } },
    { $match: { count: { $gt: 1 } } }
  ])

  console.log(`[seed-dedupe-pet-species] found ${dupGroups.length} duplicate species groups`)
  if (dupGroups.length === 0) {
    console.log('[seed-dedupe-pet-species] nothing to do, exiting')
    await mongoose.disconnect()
    return
  }

  let totalRemoved = 0
  let totalEventsWritten = 0

  for (const group of dupGroups) {
    const { org, student, species } = group._id
    const pairs = group.ids.map((id, i) => ({ id, adoptedAt: group.adoptedAts[i] }))
    pairs.sort((a, b) => new Date(a.adoptedAt) - new Date(b.adoptedAt)) // 早 → 晚
    const [keep, ...removeList] = pairs

    console.log(`  [${species}] org=${org} student=${student} keep=${keep.id} remove=${removeList.length}`)

    if (DRY_RUN) continue

    for (const r of removeList) {
      // 拿被删宠物的状态, 写审计事件
      const removedPet = await PetAccount.findById(r.id).lean()
      if (!removedPet) continue

      await PetAccount.deleteOne({ _id: r.id })
      totalRemoved += 1

      await PetEvent.create({
        org: removedPet.org,
        student: removedPet.student,
        petAccount: removedPet._id,
        type: 'admin_abandon',
        payload: {
          reason: 'seed-dedupe',
          operator: null,
          species: removedPet.species,
          level: removedPet.level,
          experience: removedPet.experience,
          nickname: removedPet.nickname
        }
      })
      totalEventsWritten += 1
    }
  }

  console.log(`[seed-dedupe-pet-species] done. removed=${totalRemoved} events=${totalEventsWritten}`)
  await mongoose.disconnect()
}

main().catch((e) => {
  console.error('[seed-dedupe-pet-species] failed:', e)
  process.exit(1)
})