'use strict'

/**
 * 一次性数据迁移: 给历史机构的「管理员」「教务」系统职位加 recruit.* 权限码
 *
 * 背景: 招生试听 (2026-06) 新增 recruit 权限组 (recruit.read/write/convert);
 *   - DEFAULT_POSITIONS 已加上, 新建机构自动生效
 *   - 但历史机构已存在的 Position 文档需要补, ensureDefaultPositions 幂等不动旧 doc
 *
 * 用法: node packages/server/scripts/migrate-add-recruit-perms.js
 * 幂等: $addToSet + $nin 前置过滤, 多次跑不会重复添加
 * 同时: 给历史机构补 [试听专用] CourseInstance (org.service.create 路径外兜底)
 */

require('module-alias/register')
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') })

const { connect, disconnect } = require('@config/db')
const Position = require('@models/Position.model')
const Org = require('@models/Org.model')
const courseInstanceService = require('@modules/courseInstance/courseInstance.service')

const RECRUIT_PERMS = ['recruit.read', 'recruit.write', 'recruit.convert']

async function main() {
  await connect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-recruit-perms] connected')

  // ─── 1. 给历史机构的 管理员/教务 加 recruit.* 权限码 ───
  //   限制 isSystem=true (系统职位), 避免误改 admin 自定义同名岗位
  const result = await Position.updateMany(
    {
      isSystem: true,
      name: { $in: ['管理员', '教务'] },
      permissions: { $nin: ['recruit.read'] }
    },
    { $addToSet: { permissions: { $each: RECRUIT_PERMS } } }
  )
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-recruit-perms] positions touched: ${result.modifiedCount} / matched: ${result.matchedCount}`)

  // ─── 2. 给历史机构补 [试听专用] CourseInstance ───
  const orgs = await Org.find({}).select('_id name').lean()
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-recruit-perms] found ${orgs.length} orgs, ensuring trial CourseInstance...`)
  let trialInstanceCount = 0
  for (const o of orgs) {
    try {
      await courseInstanceService.ensureTrialCourseInstance(o._id)
      trialInstanceCount++
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`  [warn] org=${o.name} (${o._id}) ensureTrialCourseInstance failed:`, e.message)
    }
  }
  // eslint-disable-next-line no-console
  console.log(`[migrate-add-recruit-perms] trial course instances ensured for ${trialInstanceCount}/${orgs.length} orgs`)

  await disconnect()
  // eslint-disable-next-line no-console
  console.log('[migrate-add-recruit-perms] done')
  process.exit(0)
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error('[migrate-add-recruit-perms] failed:', e)
  process.exit(1)
})
