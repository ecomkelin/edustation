'use strict'

/**
 * 数据迁移：Org.type 从 ObjectId (ref Category) 改回 String enum。
 * 配套 Category 字典整改 (2026-06): model enum 移除 'Org'.
 *
 * 背景：
 *   - 2025-Q3 已经走过一次 migrate-org-type.js (String → ObjectId), 把当时是 String 的 type 转成 ObjectId 引用 Category.
 *   - 2026-06 整改: Org.type 改回 String enum (10 种 ORG_TYPES),
 *     Category 字典 model enum 不再含 'Org', 所以老 Category(model='Org') 数据**全删**.
 *
 * 步骤：
 *   1. 把所有 Org.type 从 ObjectId 反查对应 Category.name, 用 @shared/enums#ORG_TYPE_LEGACY_MAP 转新 enum.
 *      - 老 Category(model='Org').name ∈ {培训, 艺术, 综合}
 *      - LEGACY_MAP: training → academic, art → arts, comprehensive → comprehensive
 *   2. 找不到映射的 org (老 type 是 ObjectId 但 Category 已被清), 保留旧字符串 (`type.toString()`) → fallback 到 'other'.
 *   3. 删除所有 Category 文档 where model='Org'.
 *
 * 幂等：可重复运行, 已迁移过的 org (type 是 String enum) 会被跳过.
 *
 * 运行： node packages/server/scripts/migrate-org-type-to-string.js
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')
const Org = require('@models/Org.model')
const Category = require('@models/Category.model')
const { ORG_TYPE_LEGACY_MAP } = require('@shared/enums')

// 旧 Category(model='Org').name → 新 enum 的映射 (与 LEGACY_MAP 同语义, 但 key 是中文 label)
const LEGACY_LABEL_TO_ENUM = {
  培训: 'academic',
  艺术: 'arts',
  综合: 'comprehensive'
}

async function main() {
  // eslint-disable-next-line no-console
  console.log('[migrate-org-type-to-string] start')
  await connect()

  // ---- step 1: build name→enum map from existing Org Categories (历史数据兼容)
  const orgCats = await Category.find({ model: 'Org' }).select('name').lean()
  // eslint-disable-next-line no-console
  console.log(`[migrate-org-type-to-string] found ${orgCats.length} old Org Categories`)

  const nameToEnum = { ...LEGACY_LABEL_TO_ENUM }
  for (const c of orgCats) {
    if (!nameToEnum[c.name]) {
      // eslint-disable-next-line no-console
      console.warn(`[migrate-org-type-to-string] 未识别的老 Category 名称 "${c.name}", fallback 到 'other'`)
      nameToEnum[c.name] = 'other'
    }
  }

  // ---- step 2: 把 org.type 从 ObjectId 翻 String
  const orgs = await Org.find({ type: { $type: 'objectId' } }).select('_id type').lean()
  // eslint-disable-next-line no-console
  console.log(`[migrate-org-type-to-string] found ${orgs.length} orgs with ObjectId type`)

  let updated = 0
  let fallenBack = 0
  for (const o of orgs) {
    const cat = await Category.findById(o.type).select('name').lean()
    const enumVal = cat && nameToEnum[cat.name] ? nameToEnum[cat.name] : 'other'
    if (!cat) fallenBack += 1
    await Org.updateOne({ _id: o._id }, { $set: { type: enumVal } })
    updated += 1
  }
  // eslint-disable-next-line no-console
  console.log(`[migrate-org-type-to-string] updated=${updated}, fallenBack=${fallenBack}`)

  // ---- step 3: 清掉所有 Org Category 文档
  const del = await Category.deleteMany({ model: 'Org' })
  // eslint-disable-next-line no-console
  console.log(`[migrate-org-type-to-string] deleted ${del.deletedCount} Org Categories`)

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-org-type-to-string] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-org-type-to-string] failed:', e)
  process.exit(1)
})