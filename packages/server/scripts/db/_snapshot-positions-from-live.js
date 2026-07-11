'use strict'

/**
 * 一次性脚本: 把 live DB 的 positions snapshot 回写到 initial.data.json (2026-07-11)
 *
 * 触发原因:
 *   - 用户在 admin 编辑职位权限后, 改的只是 live DB; 重跑 `pnpm db:seeds` 会回退到旧 seed
 *   - 现把 live 现状落盘到 JSON, 以后 db:seeds 才能保留"当前实际生效"的职位权限
 *
 * 策略 (per CLAUDE.md §0 开发阶段):
 *   - 只动 JSON 的 positions[*]; 其它 section (users, orgs, user_org_rels ...) 不动
 *   - 保持原 _id / org / name / isSystem / clientLevel / createdAt / updatedAt / meta 等字段
 *     只用 live 数据覆盖 permissions 数组 + 必要字段 (perms 跟着 live 走)
 *   - 严格 1:1 _id 对齐, 避免 user_org_rels 等引用悬挂
 *
 * 用法:
 *   node scripts/db/_snapshot-positions-from-live.js              # 默认 dry-run
 *   node scripts/db/_snapshot-positions-from-live.js --apply      # 写回 initial.data.json
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')
const Position = require('@models/Position.model')

const DATA_PATH = path.join(__dirname, 'seeds/initial.data.json')
const APPLY = process.argv.includes('--apply')

async function main() {
  if (!fs.existsSync(DATA_PATH)) throw new Error(`[snapshot] 找不到种子: ${DATA_PATH}`)

  await mongoose.connect(process.env.MONGODB_URI)
  const live = await Position.find({}).select('_id org name isSystem clientLevel permissions createdAt updatedAt meta').lean()
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))

  console.log(`[snapshot] live positions=${live.length}, json positions=${(data.positions || []).length}`)

  // 按 _id 建索引方便 diff
  const liveById = new Map(live.map((p) => [String(p._id), p]))
  const jsonById = new Map((data.positions || []).map((p) => [String(p._id), p]))

  const summary = []
  // 1. live 里有的 _id → 用 live 全字段覆盖 (含 permissions)
  for (const lp of live) {
    const id = String(lp._id)
    const sp = jsonById.get(id)
    if (!sp) {
      console.log(`  + NEW (live only) ${lp.name} _id=${id}`)
      continue
    }
    const before = (sp.permissions || []).length
    const after = (lp.permissions || []).length
    const same = JSON.stringify([...(sp.permissions || [])].sort()) === JSON.stringify([...(lp.permissions || [])].sort())
    if (same) {
      summary.push({ id, name: lp.name, action: 'skip' })
      continue
    }
    summary.push({ id, name: lp.name, action: 'update', before, after, added: after - before })
    if (APPLY) {
      sp.permissions = lp.permissions || []
      // 顺手把 isSystem / clientLevel 也同步到 live, 防止 admin 后台调整过这两字段
      sp.isSystem = lp.isSystem
      sp.clientLevel = lp.clientLevel
    }
  }
  // 2. json 里 _id 在 live 找不到的 → 警告 (不应发生)
  for (const sp of data.positions || []) {
    if (!liveById.has(String(sp._id))) {
      console.warn(`  ⚠️  JSON-only (live 找不到) _id=${sp._id} name=${sp.name} — 不删,保留在 JSON`)
    }
  }

  // 打印摘要
  console.log('\n[snapshot] 改动摘要:')
  for (const s of summary) {
    if (s.action === 'skip') {
      console.log(`  = ${s.name.padEnd(8)} _id=${s.id} 权限无变化`)
    } else {
      console.log(`  Δ ${s.name.padEnd(8)} _id=${s.id} ${s.before} → ${s.after} (Δ ${s.after - s.before >= 0 ? '+' : ''}${s.after - s.before})`)
    }
  }

  if (!APPLY) {
    console.log('\n[snapshot] DRY-RUN. 加 --apply 写回 initial.data.json')
    await mongoose.disconnect()
    process.exit(0)
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8')
  console.log(`\n[snapshot] ✓ 写入 ${DATA_PATH}`)
  console.log('[snapshot] 后续: pnpm db:seeds 验证新 seed 灌入后与 live 一致')

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((e) => { console.error('[snapshot] failed:', e); process.exit(1) })