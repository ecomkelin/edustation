'use strict'

/**
 * 一次性脚本: 重做 users + positions + user_org_rels 种子 (2026-07-11)
 *
 * 触发原因:
 *   - 用户在 admin /positions 编辑弹窗看到红色 toast "权限码 game.read 不存在"
 *     根因: initial.data.json 的 positions[*].permissions 还残留 game.*
 *   - 用户要求重新生成种子, 按当前 梓潼县人工智网 的职位为准;
 *     平台超管密码 = Admin@123, 其它 user 密码 = 000000
 *
 * 改动 (不写兼容 shim, 按 CLAUDE.md §0 开发阶段策略):
 *   - positions[*].permissions: $pull 所有以 'game.' 开头的
 *   - users[*].passwordHash: 平台超管 (isPlatformAdmin=true) → argon2('Admin@123')
 *                             其它                       → argon2('000000')
 *
 * 用法:
 *   node scripts/db/_regen-users-positions.js              # 默认 dry-run, 只打印 diff
 *   node scripts/db/_regen-users-positions.js --apply      # 写 initial.data.json
 *                                                          # ⚠ 后续还需手动 pnpm db:seeds
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') })

const fs = require('fs')
const path = require('path')
const argon2 = require('argon2')

const DATA_PATH = path.join(__dirname, 'seeds/initial.data.json')

const APPLY = process.argv.includes('--apply')

// 用户明确指定: 平台超管用 Admin@123, 其它 user 用 000000
const PWD_PLATFORM_ADMIN = 'Admin@123'
const PWD_DEFAULT = '000000'

async function hashPassword(plain) {
  return argon2.hash(plain, { type: argon2.argon2id })
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`[regen] 找不到种子文件: ${DATA_PATH}`)
  }

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))

  // ─── 1. positions[*].permissions: 清掉 game.* ───
  let posStripped = 0
  let posGameCount = 0
  const gamePermsSeen = new Set()
  for (const p of data.positions || []) {
    const before = Array.isArray(p.permissions) ? p.permissions.length : 0
    const filtered = (p.permissions || []).filter((perm) => {
      if (typeof perm === 'string' && perm.startsWith('game.')) {
        gamePermsSeen.add(perm)
        return false
      }
      return true
    })
    const after = filtered.length
    if (before !== after) {
      posStripped += 1
      posGameCount += before - after
      p.permissions = filtered
      console.log(`  - [positions] ${p.name} (${String(p._id)}): ${before} → ${after}`)
    }
  }
  console.log(`[regen] positions: 清理 ${posGameCount} 条 game.* 权限, 涉及 ${posStripped} 个职位 (game.* 种类: ${[...gamePermsSeen].join(', ')})`)

  // ─── 2. users[*].passwordHash: 平台超管 Admin@123, 其它 000000 ───
  console.log(`[regen] users: ${(data.users || []).length} 个, 平台超管用 ${PWD_PLATFORM_ADMIN}, 其它用 ${PWD_DEFAULT}`)
  let adminCount = 0
  let otherCount = 0
  for (const u of data.users || []) {
    const plain = u.isPlatformAdmin ? PWD_PLATFORM_ADMIN : PWD_DEFAULT
    if (u.isPlatformAdmin) adminCount += 1
    else otherCount += 1
    const newHash = await hashPassword(plain)
    if (APPLY) {
      u.passwordHash = newHash
    } else {
      // dry-run 时也打印新 hash 前 30 位让你对照
      console.log(`  - [dry-run] ${u.realName} (${u.mobile}) admin=${u.isPlatformAdmin} → pwd=${plain} hash=${newHash.slice(0, 30)}…`)
    }
  }
  console.log(`[regen] users: 平台超管=${adminCount} 其它=${otherCount} 共 ${adminCount + otherCount} 个密码将重置`)

  // ─── 3. user_org_rels: 不动 (position 字段本来就空, 由运行时按 name 重新解析) ───
  console.log(`[regen] user_org_rels: 保持不变 (${(data.user_org_rels || []).length} 条)`)

  if (!APPLY) {
    console.log(`\n[regen] DRY-RUN 完成. 重新跑时加 --apply 写入 initial.data.json`)
    console.log(`[regen] 写完之后手动执行 pnpm db:seeds (会 dropDatabase + insertMany)`)
    return
  }

  // ─── 4. 写回 ───
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf8')
  console.log(`\n[regen] ✓ 写入 ${DATA_PATH}`)
  console.log(`[regen] 后续步骤:`)
  console.log(`          pnpm db:seeds      # dropDatabase + 重新 insertMany`)
  console.log(`          pnpm dev:admin     # 重启 admin 看职位权限码正常`)
}

main().catch((e) => { console.error('[regen] failed:', e); process.exit(1) })