'use strict'

/**
 * 数据迁移：清理 Subject.category 的脏数据。
 *
 * 背景：旧版 subject.seed.js 用了字符串 'art' / 'tech' 当作 category 写入数据库，
 * 而 Subject.category 实际是 ObjectId 类型，引用平台级 Category 字典。
 * 这些非法的 category 值会让 GET /subjects 的 populate('category', ...) 在查询
 * Category._id 时抛 CastError（参数类型错误: _id）。
 *
 * 本脚本：
 *  1. 扫描所有 subject 文档
 *  2. 对 category 不是合法 ObjectId 的（string 且非 24 位 hex），把 category 置为 null
 *  3. 输出清理数量。幂等：可重复执行。
 *
 * 运行： node packages/server/scripts/migrate-subject-category.js
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')
const Subject = require('@models/Subject.model')

function isValidOid(v) {
  return mongoose.isValidObjectId(v) && String(v).match(/^[0-9a-fA-F]{24}$/)
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('[migrate] start')
  await connect()

  // 找出所有脏数据：category 是字符串但不是 24 位 hex，或非 string/objectid 类型
  const all = await Subject.find({ category: { $ne: null } })
    .select('_id org name category')
    .lean()

  const dirty = all.filter((s) => !isValidOid(s.category))
  // eslint-disable-next-line no-console
  console.log(`[migrate] scanned ${all.length} subjects, dirty=${dirty.length}`)

  if (dirty.length === 0) {
    // eslint-disable-next-line no-console
    console.log('[migrate] nothing to clean')
  } else {
    const dirtyIds = dirty.map((d) => d._id)
    const r = await Subject.updateMany(
      { _id: { $in: dirtyIds } },
      { $set: { category: null } }
    )
    // eslint-disable-next-line no-console
    console.log(`[migrate] cleaned: matched=${r.matchedCount}, modified=${r.modifiedCount}`)
    for (const d of dirty) {
      // eslint-disable-next-line no-console
      console.log(`  - ${d._id} org=${d.org} name="${d.name}" category=${JSON.stringify(d.category)}`)
    }
  }

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
