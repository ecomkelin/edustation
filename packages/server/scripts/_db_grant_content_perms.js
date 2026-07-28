'use strict'
/**
 * 一次性脚本 —— 把 pet.write / article.write / video.write 三个跨机构资源敏感权限
 * 一键 grant 到指定 Position。绕过敏感 grant 校验 (本脚本里 actor 设成 isPlatformAdmin=true)。
 *
 * 背景: 见 [[shared-permissions-sensitive-content-2026-07-22]] —— 这三个权限
 *   服务端默认拒绝普通账号 grant, 必须由平台超管操作. 平台超管日常不在 admin UI 里
 *   「编辑职位」加码 (容易出错), 这里一个脚本一键搞定.
 *
 * 用法:
 *   # 1) 列 org 下所有 Position (找要 grant 的 position id):
 *   node scripts/_db_grant_content_perms.js --list <orgId>
 *
 *   # 2) 一键 grant (默认叠加上, 已存在的不重复加):
 *   node scripts/_db_grant_content_perms.js <positionId>
 *   node scripts/_db_grant_content_perms.js <positionId> --dry-run
 *
 *   # 3) 完全覆盖 (替换 permissions 数组, !!慎用!!):
 *   node scripts/_db_grant_content_perms.js <positionId> --replace
 */
require('dotenv').config()
require('module-alias/register')

const mongoose = require('mongoose')
const Position = require('@models/Position.model')

const SENSITIVE_PERMS = ['pet.write', 'article.write', 'video.write']

async function list (orgId) {
  const orgs = await mongoose.connection.db.collection('orgs')
    .find({ _id: new mongoose.Types.ObjectId(orgId) })
    .project({ name: 1 }).toArray()
  const orgName = orgs[0]?.name || '?'
  const positions = await Position.find({ org: orgId })
    .select('_id name isSystem clientLevel permissions')
    .lean()
  console.log(`org=${orgName} (${orgId}) 共有 ${positions.length} 个 Position:`)
  for (const p of positions) {
    const has = SENSITIVE_PERMS.filter((c) => (p.permissions || []).includes(c))
    console.log(
      `  [${p._id}] ${p.isSystem ? '★' : ' '} ${p.name}` +
      ` (clientLevel=${p.clientLevel}, perms=${(p.permissions || []).length}项)` +
      (has.length ? ` [含 ${has.join(', ')}]` : '')
    )
  }
}

async function grant (positionId, { dryRun = false, replace = false } = {}) {
  const pos = await Position.findById(positionId)
  if (!pos) throw new Error(`position not found: ${positionId}`)
  const before = (pos.permissions || []).slice()
  let next
  if (replace) {
    next = SENSITIVE_PERMS.slice()
    console.warn(`[WARN] --replace 模式: 用 ${SENSITIVE_PERMS.length} 个敏感权限覆写 (原 ${before.length} 项将被全部清除)`)
  } else {
    const merged = new Set(before)
    let added = 0
    for (const p of SENSITIVE_PERMS) {
      if (!merged.has(p)) { merged.add(p); added++ }
    }
    next = Array.from(merged)
    console.log(`[merge] 原 ${before.length} 项 → 新 ${next.length} 项 (新增 ${added})`)
  }
  console.log(`  before: ${JSON.stringify(before)}`)
  console.log(`  after:  ${JSON.stringify(next)}`)
  if (dryRun) {
    console.log('--dry-run, 不实际写库')
    return
  }
  pos.permissions = next
  await pos.save()
  console.log(`[done] position ${positionId} 已更新`)
}

async function main () {
  await mongoose.connect(process.env.MONGODB_URI)
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const replace = args.includes('--replace')
  const filtered = args.filter((a) => !a.startsWith('--'))

  if (filtered[0] === '--list') {
    await list(filtered[1])
  } else if (filtered.length === 1) {
    await grant(filtered[0], { dryRun, replace })
  } else {
    console.error('用法见脚本顶部注释')
    process.exit(1)
  }
}

main()
  .then(() => mongoose.disconnect())
  .catch((e) => {
    console.error('[fatal]', e.message)
    mongoose.disconnect().finally(() => process.exit(1))
  })
