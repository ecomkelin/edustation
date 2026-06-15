'use strict'

/**
 * 招生渠道 (Channel) 种子 (2026-06-15)
 *
 * - 套 Category 字典, model='Channel', 被 Parent.source / ChildLead.source 引用
 * - 6 个预设: 地推 / 客户介绍 / 朋友介绍 / 电话邀约 / 进校园 / 其他合作
 * - 地推 = 默认渠道 (排序 1, 也是新建家长时未指定 source 时的回退)
 * - 幂等: 跑多次不会重复 (按 (model, name) 唯一索引去重; 已存在则跳过并修正 sort/isActive)
 * - 不影响其它字典 (Org/Student/Subject/LeadTag); 只在 categories 集合里 upsert 这 6 条
 *
 * 调用:
 *   node -e "require('module-alias/register'); require('./scripts/db/seeds/channel.seed').run().then(()=>process.exit())"
 *   或加进 init-seeds 一起跑
 *
 * 默认渠道解析: parent.service#getDefaultChannelId / childLead.service#getDefaultChannelId
 *   通过 Category.findOne({model:'Channel', name:'地推'}) 拿到 _id
 */
const Category = require('@models/Category.model')

const CHANNELS = [
  { name: '地推',       sort: 1, isDefault: true },
  { name: '客户介绍',   sort: 2 },
  { name: '朋友介绍',   sort: 3 },
  { name: '电话邀约',   sort: 4 },
  { name: '进校园',     sort: 5 },
  { name: '其他合作',   sort: 6 }
]

async function run() {
  const inserted = []
  const skipped = []
  for (const c of CHANNELS) {
    // 顶级 (parentCategory=null) 在 (model, name, parentCategory) 唯一索引下天然去重
    const existing = await Category.findOne({
      model: 'Channel',
      name: c.name,
      parentCategory: null
    })
      .select('_id sort isActive')
      .lean()
    if (existing) {
      // 顺手把 sort/isActive 修正到 seed 期望值 (只在这两个字段有差时写)
      const patch = {}
      if (existing.sort !== c.sort) patch.sort = c.sort
      if (existing.isActive !== true) patch.isActive = true
      if (Object.keys(patch).length > 0) {
        await Category.updateOne({ _id: existing._id }, { $set: patch })
      }
      skipped.push(c.name)
      continue
    }
    const created = await Category.create({
      model: 'Channel',
      name: c.name,
      level: 0,
      parentCategory: null,
      sort: c.sort,
      isActive: true
    })
    inserted.push(created.name)
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.channel] inserted: [${inserted.join(', ') || '∅'}] | already-exists: [${skipped.join(', ') || '∅'}]`)
  return { inserted, skipped }
}

module.exports = { run, CHANNELS }
