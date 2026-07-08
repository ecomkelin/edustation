'use strict'

/**
 * Migration: 把 user_org_rels.positions 字段从 String 改成 ObjectId
 *
 * Why (2026-07-08):
 *   - 早期 seed / 接口写 user_org_rels 时, positions 字段直接 `String(_id)` 存了,
 *     与 schema `[{ type: ObjectId, ref: 'Position' }]` 不符
 *   - user.service.js 的 `relFilter.positions = { $in: staffPosIds }` 用 ObjectId,
 *     MongoDB 严格类型匹配 → 0 结果 → 员工下拉空
 *   - 现象: 任务模块新建页"找不到任何员工", 但 list user 时候不报错 (返回 [])
 *
 * 一键检查 + 修:
 *   mongosh "mongodb://127.0.0.1:27017/edustation_dev" --eval "
 *     db.user_org_rels.countDocuments({ 'positions.0': { \$type: 'string' } })
 *   "
 *   返回 N>0 就跑此脚本
 *
 * 运行:
 *   node packages/server/scripts/db/migrate-rel-positions-to-objectid.js
 *
 * 幂等: 已经 ObjectId 的 rel 不会被改 (用 $type 过滤)
 */

require('@config') // 触发 .env 加载

const mongoose = require('mongoose')

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('MONGODB_URI not set')
    process.exit(1)
  }
  await mongoose.connect(uri)

  const db = mongoose.connection.db
  const coll = db.collection('user_org_rels')

  // 只挑出 positions[0] 还是 string 的 (24-hex 模式)
  const hexRe = /^[0-9a-fA-F]{24}$/
  const stringRels = await coll.find({ 'positions.0': { $type: 'string' } }).toArray()

  console.log(`Found ${stringRels.length} rels with string positions.`)
  let migrated = 0
  let skipped = 0
  for (const r of stringRels) {
    if (!Array.isArray(r.positions)) {
      skipped++
      continue
    }
    // 校验全部都是 24-hex, 否则跳过 (脏数据)
    const allHex = r.positions.every((p) => typeof p === 'string' && hexRe.test(p))
    if (!allHex) {
      console.warn(`Skip rel ${r._id} — positions contain non-hex strings:`, r.positions)
      skipped++
      continue
    }
    const oids = r.positions.map((p) => new mongoose.Types.ObjectId(p))
    await coll.updateOne({ _id: r._id }, { $set: { positions: oids } })
    migrated++
  }

  console.log(`Migrated ${migrated} rels (skipped ${skipped}).`)
  const remain = await coll.countDocuments({ 'positions.0': { $type: 'string' } })
  console.log(`Remaining string positions[0]: ${remain}`)

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})