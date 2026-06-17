'use strict'

/**
 * migrate-parent-profile-to-parent.js
 *
 * 背景 (2026-06-16 重构):
 *   - 家长沟通画像 4 字段 (commStyle/familyBg/childFocus/followUp) + 2 元数据
 *     从 UserOrgRel 搬到 Parent
 *   - UserOrgRel 老字段 schema 同步删, 物理数据由本脚本 $unset 清理
 *   - 原因: UserOrgRel 上有 user 字段才允许写, 潜客阶段 (parent.user=null)
 *     写不进去 → 422 报错; 搬到 Parent 后 Parent 任何时候都能写
 *
 * 用法:
 *   cd packages/server && node scripts/migrate-parent-profile-to-parent.js
 *
 * 幂等:
 *   - 二次跑: rels 已被 unset 字段 → count 0 → stats.migrated=0, 正常退出
 *
 * 安全:
 *   - 只迁移有画像的 rel (4 字段任一非空)
 *   - 脏数据 (user 已删 / 找不到 parent) 丢到 skipped, 不报错
 *   - 不引入 mongo 事务 (单节点不支持)
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const mongoose = require('mongoose')
const { connect, disconnect } = require('@config/db')
const UserOrgRel = require('@models/UserOrgRel.model')
const Parent = require('@models/Parent.model')
const User = require('@models/User.model')

// === 1. 查老 rel 上有画像的 (4 字段任一非空, $regex:'\S' 处理 undefined) ===
const PROFILE_OR = [
  { commStyle: { $regex: '\\S' } },
  { familyBg: { $regex: '\\S' } },
  { childFocus: { $regex: '\\S' } },
  { followUp: { $regex: '\\S' } }
]

async function main() {
  await connect()
  const rels = await UserOrgRel.find({ $or: PROFILE_OR }).lean()
  console.log(`[migrate-parent-profile] 找到 ${rels.length} 条带画像的 rel`)

  const stats = {
    relsTotal: rels.length,
    migrated: 0,
    skipped: { 'no-user': 0, 'user-deleted': 0, 'no-parent': 0, 'multi-parent': 0, 'parent-err': 0 }
  }
  const toUnset = [] // 跑完后要 unset 老字段的 relId

  for (const rel of rels) {
    // 1) rel.user 必须存在 (理论上 setProfile 之前 422 拒绝 user=null, 所以这里不该命中)
    if (!rel.user) {
      stats.skipped['no-user']++
      continue
    }
    // 2) 校验 user 实际还存在 (user.service 可能物理删 user)
    const user = await User.findById(rel.user).select('_id').lean()
    if (!user) {
      stats.skipped['user-deleted']++
      continue
    }
    // 3) 用 (org, user) 找 Parent, 期望唯一 (Parent 没有 (org, user) 唯一索引但业务上 1 家长 1 user)
    const parents = await Parent.find({ org: rel.org, user: rel.user }).select('_id').lean()
    if (parents.length === 0) {
      stats.skipped['no-parent']++
      continue
    }
    if (parents.length > 1) {
      stats.skipped['multi-parent']++
      continue
    }
    // 4) 写入 Parent
    try {
      await Parent.updateOne(
        { _id: parents[0]._id },
        {
          $set: {
            commStyle: rel.commStyle || '',
            familyBg: rel.familyBg || '',
            childFocus: rel.childFocus || '',
            followUp: rel.followUp || '',
            profileLastUpdatedBy: rel.profileLastUpdatedBy || null,
            profileLastUpdatedAt: rel.profileLastUpdatedAt || null
          }
        }
      )
      toUnset.push(rel._id)
      stats.migrated++
    } catch (e) {
      console.warn(`[migrate-parent-profile] rel=${rel._id} update err:`, e.message)
      stats.skipped['parent-err']++
    }
  }

  // === 2. $unset 老字段 (一次性清理) ===
  let unsetCount = 0
  if (toUnset.length > 0) {
    const r = await UserOrgRel.updateMany(
      { _id: { $in: toUnset } },
      {
        $unset: {
          commStyle: '',
          familyBg: '',
          childFocus: '',
          followUp: '',
          profileLastUpdatedBy: '',
          profileLastUpdatedAt: '',
          profileMeta: ''
        }
      }
    )
    unsetCount = r.modifiedCount || 0
  }

  console.log(`[migrate-parent-profile] 完成, 迁移: ${stats.migrated}, unset: ${unsetCount}`)
  console.log('[migrate-parent-profile] skipped:', JSON.stringify(stats.skipped, null, 2))

  await disconnect()
  process.exit(0)
}

main().catch((e) => {
  console.error('[migrate-parent-profile] FAILED:', e)
  process.exit(1)
})
