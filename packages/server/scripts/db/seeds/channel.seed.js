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
  // 2026-06-25: Category 必须 per-org (Category.org 必填, 2026-06-19 整改)
  //   - 默认写梓潼 (zitong) 机构, 与初始数据一致
  //   - 平台超管专属 — 给所有启用 org 各写一份 (业务上渠道字典跟 org 走, 跟 LeadTag 一致)
  const Org = require('@models/Org.model')
  const zitong = await Org.findOne({ name: /梓潼/ }).select('_id').lean()
  if (!zitong) {
    // eslint-disable-next-line no-console
    console.warn('[seed.channel] 找不到梓潼机构, 跳过渠道 seed')
    return { inserted: [], skipped: [] }
  }
  const targetOrgs = [zitong._id]
  // 平台超管场景: 给所有启用 org 都补一份, 避免新机构前端拉空
  const allActive = await Org.find({ isActive: true }).select('_id').lean()
  for (const o of allActive) {
    if (!targetOrgs.some((id) => String(id) === String(o._id))) targetOrgs.push(o._id)
  }

  const inserted = []
  const skipped = []
  for (const orgId of targetOrgs) {
    for (const c of CHANNELS) {
      // 顶级 (parentCategory=null) 在 (org, model, name, parentCategory) 唯一索引下天然去重
      const existing = await Category.findOne({
        org: orgId,
        model: 'Channel',
        name: c.name,
        parentCategory: null
      })
        .select('_id org sort isActive')
        .lean()
      if (existing) {
        // 顺手把 sort/isActive 修正到 seed 期望值 (只在这两个字段有差时写)
        const patch = {}
        if (existing.sort !== c.sort) patch.sort = c.sort
        if (existing.isActive !== true) patch.isActive = true
        if (Object.keys(patch).length > 0) {
          await Category.updateOne({ _id: existing._id }, { $set: patch })
        }
        skipped.push(`${orgId}/${c.name}`)
        continue
      }
      const created = await Category.create({
        org: orgId,
        model: 'Channel',
        name: c.name,
        level: 0,
        parentCategory: null,
        sort: c.sort,
        isActive: true
      })
      inserted.push(`${orgId}/${created.name}`)
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[seed.channel] inserted: [${inserted.join(', ') || '∅'}] | already-exists: [${skipped.join(', ') || '∅'}]`)
  return { inserted, skipped }
}

module.exports = { run, CHANNELS }
