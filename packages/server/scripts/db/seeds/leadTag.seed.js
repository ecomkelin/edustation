'use strict'

/**
 * 招生家长标签 (LeadTag) 种子
 *
 * - 套 Category 字典, model='LeadTag', 被 Parent.tags 引用
 * - 幂等: 跑多次不会重复 (按 (model, name) 唯一索引去重; 已存在则跳过)
 * - 不影响其它字典 (Org/Student/Subject); 只在 categories 集合里 upsert 这 8 条
 *
 * 调用:
 *   node -e "require('module-alias/register'); require('./scripts/db/seeds/leadTag.seed').run().then(()=>process.exit())"
 *   或加进 init-seeds 一起跑
 */
const Category = require('@models/Category.model')

const LEAD_TAGS = [
  { name: '高意向',     sort: 1 },
  { name: '非目标客户', sort: 2 },
  { name: '倾向他课',   sort: 3 },
  { name: '价格敏感',   sort: 4 },
  { name: '距离太远',   sort: 5 },
  { name: '年龄不合适', sort: 6 },
  { name: '家庭条件',   sort: 7 },
  { name: '已流失',     sort: 8 }
]

async function run() {
  const inserted = []
  const skipped = []
  for (const t of LEAD_TAGS) {
    // 用 (model, name, parentCategory=null) 唯一索引前查; 命中就跳过
    // (Category 上有 {model, name, parentCategory} 唯一索引, parentCategory=null 是顶级)
    const existing = await Category.findOne({ model: 'LeadTag', name: t.name, parentCategory: null })
      .select('_id sort isActive')
      .lean()
    if (existing) {
      // 顺手把 sort/isActive 修正到 seed 期望值 (只在这两个字段有差时写)
      const patch = {}
      if (existing.sort !== t.sort) patch.sort = t.sort
      if (existing.isActive !== true) patch.isActive = true
      if (Object.keys(patch).length > 0) {
        await Category.updateOne({ _id: existing._id }, { $set: patch })
      }
      skipped.push(t.name)
      continue
    }
    const created = await Category.create({
      model: 'LeadTag',
      name: t.name,
      level: 0,
      parentCategory: null,
      sort: t.sort,
      isActive: true
    })
    inserted.push(created.name)
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.leadTag] inserted: [${inserted.join(', ') || '∅'}] | already-exists: [${skipped.join(', ') || '∅'}]`)
  return { inserted, skipped }
}

module.exports = { run, LEAD_TAGS }
