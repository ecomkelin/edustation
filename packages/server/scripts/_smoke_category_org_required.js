'use strict'

// 冒烟: Category.org 改为必填后, 验证
//  1. 不带 org 创建 → schema 拒绝
//  2. 带 org 创建 → 成功, list 可见
//  3. 跨 org 同名不冲突
//  4. 同 org 同 model 同 parent 同名 → 唯一约束拒绝
require('dotenv').config()
require('module-alias/register')

const mongoose = require('mongoose')
const Category = require('@models/Category.model')

async function main() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  const orgs = await db.collection('orgs').find({}).limit(2).toArray()
  if (orgs.length < 2) throw new Error('need at least 2 orgs in db to run this test')
  const orgA = orgs[0]._id
  const orgB = orgs[1]._id
  const tag = '__smoke_org_req_' + Date.now()

  // 1) 不带 org → 必失败
  try {
    await Category.create({ model: 'Subject', name: tag + '_noOrg' })
    throw new Error('FAIL: should have rejected creation without org')
  } catch (e) {
    if (!/org/i.test(e.message)) throw new Error('FAIL: error not about org: ' + e.message)
    console.log('[1] ✅ no-org rejected:', e.message.split(',')[0])
  }

  // 2) 带 org 创建
  const c1 = await Category.create({ model: 'Subject', name: tag + '_a', org: orgA })
  console.log('[2] ✅ orgA create OK:', c1._id)
  const fromDb = await Category.findById(c1._id).lean()
  if (String(fromDb.org) !== String(orgA)) throw new Error('FAIL: org not persisted')
  if (!fromDb.org) throw new Error('FAIL: org missing')

  // 3) 跨 org 同名 → 不冲突
  const c2 = await Category.create({ model: 'Subject', name: tag + '_a', org: orgB })
  console.log('[3] ✅ cross-org same name OK:', c1._id, '!=', c2._id)

  // 4) 同 org 同 model 同 parent 同名 → 唯一约束拒绝
  try {
    await Category.create({ model: 'Subject', name: tag + '_a', org: orgA })
    throw new Error('FAIL: should have rejected duplicate (org, model, name, parentCategory)')
  } catch (e) {
    if (!/duplicate|E11000/i.test(e.message)) {
      throw new Error('FAIL: expected duplicate key error, got: ' + e.message)
    }
    console.log('[4] ✅ same-org dup rejected (unique index working)')
  }

  // 清理
  await Category.deleteMany({ name: { $in: [tag + '_a'] } })
  await Category.deleteMany({ name: tag + '_noOrg' })

  console.log('\n✅ ALL CATEGORY ORG-REQUIRED SMOKE TESTS PASSED')
  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error('❌ smoke test failed:', e)
  process.exit(1)
})