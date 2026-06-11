'use strict'

/**
 * 数据迁移：Org.type 从 String 枚举改为 ObjectId ref Category。
 *
 * 策略：
 *   1. 枚举旧 type 值（training/art/comprehensive）→ 创建对应 Category 记录（model='Org'）
 *   2. 对每条 org：把 type 字符串替换为对应 Category._id
 *   3. 找不到对应 Category 的 org：unset type 字段
 *
 * 幂等：可重复运行，已迁移过的 org 不会再被改（type 已是 ObjectId）。
 *
 * 运行： node packages/server/scripts/migrate-org-type.js
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')
const Org = require('@models/Org.model')
const Category = require('@models/Category.model')

const LEGACY_TYPES = ['training', 'art', 'comprehensive']
const LEGACY_LABEL = { training: '培训', art: '艺术', comprehensive: '综合' }

async function ensureCategory(code) {
  let cat = await Category.findOne({ model: 'Org', name: LEGACY_LABEL[code] }).lean()
  if (!cat) {
    const created = await Category.create({ model: 'Org', name: LEGACY_LABEL[code], level: 0 })
    cat = created.toObject()
    // eslint-disable-next-line no-console
    console.log(`[migrate] created Category: ${cat.name} (${cat._id})`)
  }
  return cat
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('[migrate] start')
  await connect()

  const catMap = {}
  for (const t of LEGACY_TYPES) catMap[t] = await ensureCategory(t)

  const orgs = await Org.find({}).select('_id type').lean()
  // eslint-disable-next-line no-console
  console.log(`[migrate] found ${orgs.length} orgs`)

  let updated = 0
  let unsetted = 0
  for (const o of orgs) {
    const t = o.type
    if (!t) continue
    if (mongoose.isValidObjectId(t)) {
      // 已经是 ObjectId，跳过
      continue
    }
    const cat = catMap[t]
    if (cat) {
      await Org.updateOne({ _id: o._id }, { $set: { type: cat._id } })
      updated += 1
    } else {
      await Org.updateOne({ _id: o._id }, { $unset: { type: 1 } })
      unsetted += 1
      // eslint-disable-next-line no-console
      console.warn(`[migrate] org=${o._id} 未知旧 type="${t}"，已清空`)
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate] updated=${updated}, unsetted=${unsetted}`)

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate] failed:', e)
  process.exit(1)
})
