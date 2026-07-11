'use strict'

/**
 * 机构级法律协议种子 (2026-07-11 立项)
 *
 * 预置内容 (按每个启用 org 写):
 *   - 2 份必勾协议 (purchase-agreement / refund-policy) + 默认 markdown 模板
 *   - 5 份仅展示型占位 (org-about / org-faq / points-rule / share-rule / org-contact)
 *
 * 复用 `orgDefaultLegal.seedDefaultLegalDocs(orgId)`, 与 org.service.create
 * 末尾调用同一份逻辑 — 保证新建 org 与 db:seeds 跑出来的 LegalDoc 一致.
 *
 * 幂等: seedDefaultLegalDocs 已用 LegalDoc.isActive=true + key 唯一性做幂等,
 *       已存在的 key 不会覆盖 admin 后续编辑的内容.
 *
 * 调用:
 *   node -e "require('module-alias/register'); require('./scripts/db/seeds/legal.seed').run().then(()=>process.exit())"
 *   或通过 init-seeds.js 一并跑 (默认)
 */

const mongoose = require('mongoose')
const Org = require('@models/Org.model')
const orgDefaultLegal = require('@modules/org/orgDefaultLegal')

async function run() {
  console.log('[seed.legal] starting ...')

  // 显式建立连接 (mongoose 在 require 时不会自动 connect, 而 .find() 不允许 buffer 等待)
  if (mongoose.connection.readyState === 0) {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/edustation_dev'
    await mongoose.connect(uri)
  }

  const allOrgs = await Org.find({ isActive: true }).select('_id name').lean()
  if (!allOrgs.length) {
    console.warn('[seed.legal] 找不到任何启用 org, 跳过')
    return { orgs: 0, created: 0, existing: 0 }
  }

  let totalCreated = 0
  let totalExisting = 0

  for (const org of allOrgs) {
    const r = await orgDefaultLegal.seedDefaultLegalDocs(org._id)
    totalCreated += r.created
    totalExisting += r.existing
    console.log(
      `[seed.legal] org=${org.name || org._id} created+=${r.created} existing=${r.existing}`
    )
  }

  console.log(
    `[seed.legal] done. created+=${totalCreated} existing=${totalExisting} (total: ${totalCreated + totalExisting})`
  )
  return { orgs: allOrgs.length, created: totalCreated, existing: totalExisting }
}

module.exports = { run }

// 直接调用入口
if (require.main === module) {
  require('module-alias/register')
  require('dotenv').config({ path: require('path').resolve(__dirname, '../../../.env') })
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rgzw')
    .then(() => run())
    .then((s) => { console.log(JSON.stringify(s)); return mongoose.disconnect() })
    .catch((e) => { console.error(e); process.exit(1) })
}