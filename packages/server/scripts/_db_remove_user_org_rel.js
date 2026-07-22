'use strict'
/**
 * 一次性脚本 —— 删除指定机构的某用户 (按手机号) 的 user_org_rel 记录
 *
 * 触发原因: 用户管理页面李科霖 (15800000000) 在梓潼县机构下职位「—」(无), 但 rel 还在,
 *   属于脏数据. 直接清理这条 rel.
 *
 * 用法:
 *   node scripts/_db_remove_user_org_rel.js [mobile] [org-name-substr]
 *   # 默认: mobile='15800000000', org-name-substr='梓潼'
 *   # 例: node scripts/_db_remove_user_org_rel.js 13800000000 梓潼    # 删校长
 *
 * 幂等: 多次运行无副作用 (deleteMany 删 0 时输出已处理 0 条).
 */
require('dotenv').config()
require('module-alias/register')

const mongoose = require('mongoose')
const UserOrgRel = require('@models/UserOrgRel.model')
const User = require('@models/User.model')
const Org = require('@models/Org.model')

const MOBILE = process.argv[2] || '15800000000'
const ORG_NAME_SUBSTR = process.argv[3] || '梓潼'
const DRY_RUN = process.argv.includes('--dry-run')

async function main () {
  await mongoose.connect(process.env.MONGODB_URI)

  // 1) 找用户
  const user = await User.findOne({ mobile: MOBILE }).select('_id mobile realName').lean()
  if (!user) {
    console.error(`[abort] user not found: ${MOBILE}`)
    process.exit(1)
  }
  console.log(`[1] user: ${user.realName || '?'} (${user.mobile}) id=${user._id}`)

  // 2) 找机构 (按子串匹配, 「梓潼」可命中 「梓潼县人工智网...」)
  const escapedSubstr = ORG_NAME_SUBSTR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const org = await Org.findOne({ name: { $regex: escapedSubstr } }).select('_id name nameAbbreviation').lean()
  if (!org) {
    console.error(`[abort] no org matched substring: ${ORG_NAME_SUBSTR}`)
    process.exit(1)
  }
  // 多家匹配时 (有 梓潼 + 梓潼实验) 也要拒绝, 让调用方写明白
  const multiOrgs = await Org.find({ name: { $regex: escapedSubstr } }).select('name').lean()
  if (multiOrgs.length > 1) {
    console.error(`[abort] substring '${ORG_NAME_SUBSTR}' 命中 ${multiOrgs.length} 个机构, 请写更具体的名字:`)
    for (const o of multiOrgs) console.error('  -', o.name)
    process.exit(1)
  }
  console.log(`[2] org: ${org.name} id=${org._id}`)

  // 3) 找要删除的 rel (列出所有匹配, 不只第一条)
  const rels = await UserOrgRel.find({ user: user._id, org: org._id })
    .select('_id user org positions isAdmin isMain')
    .lean()
  console.log(`[3] found ${rels.length} rel(s) for (user, org) pair`)
  for (const r of rels) {
    console.log(`    rel ${r._id} positions=${JSON.stringify(r.positions)} isAdmin=${r.isAdmin} isMain=${r.isMain}`)
  }

  if (rels.length === 0) {
    console.log('[done] no rel to delete')
    return
  }

  // 4) 删除
  if (DRY_RUN) {
    console.log('[4] DRY-RUN 模式, 不实际删除 (--dry-run)')
  } else {
    const result = await UserOrgRel.deleteMany({ user: user._id, org: org._id })
    console.log(`[4] deleteMany: deletedCount=${result.deletedCount}`)
  }

  // 5) 复查
  const after = await UserOrgRel.countDocuments({ user: user._id, org: org._id })
  console.log(`[5] after: ${after} rel(s) remaining for (user, org)`)
}

main()
  .then(() => mongoose.disconnect())
  .catch((e) => {
    console.error('[fatal]', e)
    mongoose.disconnect().finally(() => process.exit(1))
  })
