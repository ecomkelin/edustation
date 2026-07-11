'use strict'

/**
 * 一次性脚本: 把指定职位 (管理员 + 老师) 从 live DB snapshot 回写到 initial.data.json (2026-07-11)
 *
 * 触发原因:
 *   - 用户在 admin 后台调过这两个职位的权限, live DB 跟 seed JSON 已经不一致
 *   - 此前 _snapshot-positions-from-live.js 是全量, 用户这次只想动 2 个职位
 *
 * 锁定目标 (按 _id):
 *   - 6a2fb344aa8152333e4de587  梓潼 管理员 (sys)
 *   - 6a2fb344aa8152333e4de589  梓潼 老师
 *
 * 策略 (per CLAUDE.md §0):
 *   - 只动这两个 _id 对应的 JSON 节点, 其它 5 个职位不动
 *   - permissions / isSystem / clientLevel 同步到 live
 *   - 其它字段 (_id / org / name / createdAt / meta 等) 不动
 *
 * 用法:
 *   node scripts/db/_snapshot-target-positions.js              # dry-run, 默认
 *   node scripts/db/_snapshot-target-positions.js --apply      # 写回
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const Position = require('@models/Position.model')

const DATA_PATH = path.join(__dirname, 'seeds/initial.data.json')
const APPLY = process.argv.includes('--apply')

// 锁定的 2 个职位 (梓潼管理员 sys + 梓潼老师)
const TARGET_IDS = [
  '6a2fb344aa8152333e4de587', // 梓潼 管理员 (sys=true)
  '6a2fb344aa8152333e4de589'  // 梓潼 老师
]

async function main() {
  if (!fs.existsSync(DATA_PATH)) throw new Error(`[snapshot] 找不到种子: ${DATA_PATH}`)

  await mongoose.connect(process.env.MONGODB_URI)
  const live = await Position.find({ _id: { $in: TARGET_IDS.map((s) => new mongoose.Types.ObjectId(s)) } })
    .select('_id org name isSystem clientLevel permissions createdAt updatedAt meta')
    .lean()
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))

  console.log(`[snapshot] 锁定目标 ${TARGET_IDS.length} 个职位, live 实际命中 ${live.length} 个`)
  console.log(`[snapshot] JSON positions=${(data.positions || []).length}`)

  let updated = 0
  let skipped = 0
  for (const lp of live) {
    const id = String(lp._id)
    const sp = (data.positions || []).find((p) => String(p._id) === id)
    if (!sp) {
      console.log(`  ! live 找到但 JSON 找不到 _id=${id} ${lp.name}, 跳过`)
      continue
    }
    const before = (sp.permissions || []).length
    const after = (lp.permissions || []).length
    const same = JSON.stringify([...(sp.permissions || [])].sort()) === JSON.stringify([...(lp.permissions || [])].sort())
    if (same && sp.isSystem === lp.isSystem && sp.clientLevel === lp.clientLevel) {
      console.log(`  = ${lp.name.padEnd(8)} (${id}) perms=${after} 已是 live 现状, 跳过`)
      skipped += 1
      continue
    }

    const added = (lp.permissions || []).filter((x) => !(sp.permissions || []).includes(x))
    const removed = (sp.permissions || []).filter((x) => !(lp.permissions || []).includes(x))
    console.log(`\n  Δ ${lp.name.padEnd(8)} (${id}) org=${String(lp.org)} seed ${before} → live ${after}`)
    added.forEach((x) => console.log(`    + ${x}`))
    removed.forEach((x) => console.log(`    - ${x}`))
    updated += 1  // 标记为待写 (dry-run 也计数, 让摘要真实)

    if (APPLY) {
      sp.permissions = lp.permissions || []
      sp.isSystem = lp.isSystem
      sp.clientLevel = lp.clientLevel
    }
  }

  // JSON 里有但 live 找不到的 target_id (理论不应发生)
  for (const id of TARGET_IDS) {
    if (!live.find((p) => String(p._id) === id)) {
      console.warn(`  ⚠️  目标 _id=${id} 在 live 找不到`)
    }
  }

  if (!APPLY) {
    console.log(`\n[snapshot] DRY-RUN summary: 准备写回 ${updated} 条, 跳过 ${skipped} 条`)
    console.log('[snapshot] 加 --apply 写回 initial.data.json')
    await mongoose.disconnect()
    process.exit(0)
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8')
  console.log(`\n[snapshot] ✓ 写入 ${DATA_PATH}, 更新 ${updated} 条, 跳过 ${skipped} 条`)
  console.log('[snapshot] 后续: pnpm db:seeds 验证 round-trip')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => { console.error('[snapshot] failed:', e); process.exit(1) })